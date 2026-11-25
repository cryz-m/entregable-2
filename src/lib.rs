// ═══════════════════════════════════════════════════════════════════════════
// DEPÓSITO SEGURO
// Un escrow para el depósito de garantía de un alquiler en Costa Rica.
//
// El inquilino deposita en el contrato. Al terminar el contrato:
//   · las dos partes pueden repartirlo firmando juntas (settle), o
//   · el inquilino puede reclamar todo 15 días después (claim), o
//   · el arrendador abre una disputa con evidencia (dispute) y un árbitro
//     neutral decide el reparto (resolve).
//
// El contrato nunca deja que una sola parte se quede con el dinero.
// ═══════════════════════════════════════════════════════════════════════════
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token::TokenClient, Address, BytesN, Env,
};
use stellar_access::ownable::{enforce_owner_auth, get_owner, set_owner, Ownable};

/// Días que tiene el arrendador para justificar una deducción antes de que el
/// inquilino pueda reclamar todo. Sale del proyecto de ley 25.288 (15 días).
pub const GRACE_PERIOD: u64 = 15 * 24 * 60 * 60;

// TTL (en ledgers, 1 ledger ≈ 5 segundos).
// Si a la entrada le quedan menos de un día, se renueva a unos 30 días.
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 518_400;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Agreement,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    AwaitingFunds,
    Active,
    Disputed,
    Closed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Agreement {
    pub tenant: Address,
    pub landlord: Address,
    pub token: Address,
    pub amount: i128,
    pub lease_end: u64,
    pub claim_deadline: u64,
    pub status: Status,
    pub evidence: Option<BytesN<32>>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    InvalidDeadline = 2,
    InvalidParties = 3,
    AlreadyFunded = 4,
    InvalidState = 5,
    TooEarly = 6,
    DeadlinePassed = 7,
    NotDisputed = 8,
    InvalidSplit = 9,
    NotInitialized = 10,
}

// ── Eventos ────────────────────────────────────────────────────────────────
// Sirven para que wallets y exploradores muestren el historial sin leer el
// storage. Los topics permiten filtrar por inquilino o arrendador.

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Funded {
    #[topic]
    pub tenant: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settled {
    #[topic]
    pub tenant: Address,
    #[topic]
    pub landlord: Address,
    pub tenant_refund: i128,
    pub landlord_amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Disputed {
    #[topic]
    pub landlord: Address,
    pub evidence: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub tenant: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Resolved {
    #[topic]
    pub arbiter: Address,
    pub tenant_refund: i128,
    pub landlord_amount: i128,
}

#[contract]
pub struct DepositoSeguro;

#[contractimpl]
impl DepositoSeguro {
    /// Corre una sola vez, al desplegar. Deja el acuerdo listo para fondear.
    ///
    /// `amount` va en la unidad mínima del token (stroops si es XLM).
    /// `lease_end` es un timestamp Unix en segundos.
    pub fn __constructor(
        env: Env,
        tenant: Address,
        landlord: Address,
        arbiter: Address,
        token: Address,
        amount: i128,
        lease_end: u64,
    ) {
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if tenant == landlord || tenant == arbiter || landlord == arbiter {
            panic_with_error!(&env, Error::InvalidParties);
        }

        let now = env.ledger().timestamp();
        if lease_end <= now {
            panic_with_error!(&env, Error::InvalidDeadline);
        }
        let claim_deadline = match lease_end.checked_add(GRACE_PERIOD) {
            Some(deadline) => deadline,
            None => panic_with_error!(&env, Error::InvalidDeadline),
        };

        // El árbitro es el "owner" de OpenZeppelin: puede transferir su rol en
        // dos pasos si tiene que ser reemplazado, pero no puede tocar fondos
        // fuera de resolve().
        set_owner(&env, &arbiter);

        let agreement = Agreement {
            tenant,
            landlord,
            token,
            amount,
            lease_end,
            claim_deadline,
            status: Status::AwaitingFunds,
            evidence: None,
        };
        write_agreement(&env, &agreement);
    }

    /// El inquilino deposita el monto exacto en el contrato.
    /// Se puede llamar una sola vez.
    pub fn fund(env: Env) -> Result<(), Error> {
        let mut agreement = read_agreement(&env);
        if agreement.status != Status::AwaitingFunds {
            return Err(Error::AlreadyFunded);
        }

        agreement.tenant.require_auth();

        // Primero el estado, después la llamada externa al token. Si el token
        // intenta reentrar, ya ve el contrato como Active, no como AwaitingFunds.
        agreement.status = Status::Active;
        write_agreement(&env, &agreement);

        let contract = env.current_contract_address();
        TokenClient::new(&env, &agreement.token).transfer(
            &agreement.tenant,
            &contract,
            &agreement.amount,
        );

        Funded {
            tenant: agreement.tenant,
            amount: agreement.amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Las dos partes firman el reparto final. `tenant_refund` es lo que
    /// vuelve al inquilino; el resto va al arrendador.
    ///
    /// También sirve durante una disputa: si las partes se ponen de acuerdo,
    /// no hace falta esperar al árbitro.
    pub fn settle(env: Env, tenant_refund: i128) -> Result<(), Error> {
        let mut agreement = read_agreement(&env);
        if agreement.status != Status::Active && agreement.status != Status::Disputed {
            return Err(Error::InvalidState);
        }

        let landlord_amount = checked_split(&agreement, tenant_refund)?;

        // Las dos firmas: nadie puede mover el depósito solo.
        agreement.tenant.require_auth();
        agreement.landlord.require_auth();

        // Checks-effects-interactions: cerrar antes de transferir.
        agreement.status = Status::Closed;
        write_agreement(&env, &agreement);
        pay_out(&env, &agreement, tenant_refund);

        Settled {
            tenant: agreement.tenant,
            landlord: agreement.landlord,
            tenant_refund,
            landlord_amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Pasados los 15 días desde el fin del contrato, el inquilino recupera
    /// todo si el arrendador no abrió una disputa.
    pub fn claim(env: Env) -> Result<(), Error> {
        let mut agreement = read_agreement(&env);
        if agreement.status != Status::Active {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() < agreement.claim_deadline {
            return Err(Error::TooEarly);
        }

        agreement.tenant.require_auth();

        agreement.status = Status::Closed;
        write_agreement(&env, &agreement);
        pay_out(&env, &agreement, agreement.amount);

        Claimed {
            tenant: agreement.tenant,
            amount: agreement.amount,
        }
        .publish(&env);
        Ok(())
    }

    /// El arrendador justifica una deducción con el hash de la evidencia
    /// (fotos, inventario, presupuesto de reparación). Debe hacerlo después
    /// del fin del contrato y antes de que venza el plazo de 15 días.
    ///
    /// La evidencia no se guarda en el contrato: solo su hash. El documento
    /// vive fuera de la cadena y se puede verificar contra ese hash.
    pub fn dispute(env: Env, evidence: BytesN<32>) -> Result<(), Error> {
        let mut agreement = read_agreement(&env);
        if agreement.status != Status::Active {
            return Err(Error::InvalidState);
        }

        let now = env.ledger().timestamp();
        if now < agreement.lease_end {
            return Err(Error::TooEarly);
        }
        if now >= agreement.claim_deadline {
            return Err(Error::DeadlinePassed);
        }

        agreement.landlord.require_auth();

        agreement.status = Status::Disputed;
        agreement.evidence = Some(evidence.clone());
        write_agreement(&env, &agreement);

        Disputed {
            landlord: agreement.landlord,
            evidence,
        }
        .publish(&env);
        Ok(())
    }

    /// El árbitro neutral decide cuánto vuelve al inquilino. El resto va al
    /// arrendador. Solo se puede llamar si hay una disputa abierta.
    pub fn resolve(env: Env, tenant_refund: i128) -> Result<(), Error> {
        let mut agreement = read_agreement(&env);
        if agreement.status != Status::Disputed {
            return Err(Error::NotDisputed);
        }

        // OpenZeppelin Ownable: exige la firma del árbitro configurado y
        // devuelve su dirección.
        let arbiter = enforce_owner_auth(&env);

        let landlord_amount = checked_split(&agreement, tenant_refund)?;

        agreement.status = Status::Closed;
        write_agreement(&env, &agreement);
        pay_out(&env, &agreement, tenant_refund);

        Resolved {
            arbiter,
            tenant_refund,
            landlord_amount,
        }
        .publish(&env);
        Ok(())
    }

    // ── Consultas (no piden firma) ─────────────────────────────────────────

    pub fn agreement(env: Env) -> Agreement {
        read_agreement(&env)
    }

    pub fn status(env: Env) -> Status {
        read_agreement(&env).status
    }

    pub fn claim_deadline(env: Env) -> u64 {
        read_agreement(&env).claim_deadline
    }

    pub fn arbiter(env: Env) -> Option<Address> {
        get_owner(&env)
    }
}

// Expone get_owner, transfer_ownership, accept_ownership y renounce_ownership
// del módulo Ownable de OpenZeppelin.
#[contractimpl(contracttrait)]
impl Ownable for DepositoSeguro {}

// ── Helpers internos ───────────────────────────────────────────────────────

fn read_agreement(env: &Env) -> Agreement {
    let key = DataKey::Agreement;
    let agreement: Agreement = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    agreement
}

fn write_agreement(env: &Env, agreement: &Agreement) {
    let key = DataKey::Agreement;
    env.storage().persistent().set(&key, agreement);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Valida el reparto y devuelve cuánto le toca al arrendador.
/// No hay floats: los porcentajes se calculan fuera y acá solo se reparte.
fn checked_split(agreement: &Agreement, tenant_refund: i128) -> Result<i128, Error> {
    if tenant_refund < 0 || tenant_refund > agreement.amount {
        return Err(Error::InvalidSplit);
    }
    Ok(agreement.amount - tenant_refund)
}

/// Mueve el depósito desde el contrato a las dos partes.
/// Si una transferencia falla, toda la transacción se revierte.
fn pay_out(env: &Env, agreement: &Agreement, tenant_refund: i128) {
    let landlord_amount = agreement.amount - tenant_refund;
    let contract = env.current_contract_address();
    let token = TokenClient::new(env, &agreement.token);

    if tenant_refund > 0 {
        token.transfer(&contract, &agreement.tenant, &tenant_refund);
    }
    if landlord_amount > 0 {
        token.transfer(&contract, &agreement.landlord, &landlord_amount);
    }
}

#[cfg(test)]
mod test;

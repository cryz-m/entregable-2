// Se corren con:  cargo test
use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    BytesN, Env,
};

const START: u64 = 1_700_000_000; // 14 nov 2023
const DAY: u64 = 24 * 60 * 60;
const DEPOSIT: i128 = 10_000_000_000; // 1 000 XLM en stroops
const REFUND: i128 = 4_000_000_000; // 400 XLM
const ARBITER_REFUND: i128 = 3_000_000_000; // 300 XLM

struct Parties {
    tenant: Address,
    landlord: Address,
    arbiter: Address,
    token: Address,
    lease_end: u64,
}

fn setup() -> (Env, DepositoSeguroClient<'static>, Parties) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START);

    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let issuer = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = sac.address();
    let lease_end = START + 30 * DAY;

    let id = env.register(
        DepositoSeguro,
        (&tenant, &landlord, &arbiter, &token, &DEPOSIT, &lease_end),
    );
    let client = DepositoSeguroClient::new(&env, &id);

    // El inquilino tiene exactamente el depósito.
    StellarAssetClient::new(&env, &token).mint(&tenant, &DEPOSIT);

    (
        env,
        client,
        Parties {
            tenant,
            landlord,
            arbiter,
            token,
            lease_end,
        },
    )
}

fn evidence(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7; 32])
}

fn token<'a>(env: &'a Env, parties: &Parties) -> TokenClient<'a> {
    TokenClient::new(env, &parties.token)
}

// ── Constructor ────────────────────────────────────────────────────────────

#[test]
fn constructor_guarda_el_acuerdo() {
    let (_env, client, parties) = setup();

    let agreement = client.agreement();
    assert_eq!(agreement.tenant, parties.tenant);
    assert_eq!(agreement.landlord, parties.landlord);
    assert_eq!(agreement.token, parties.token);
    assert_eq!(agreement.amount, DEPOSIT);
    assert_eq!(agreement.lease_end, parties.lease_end);
    assert_eq!(agreement.claim_deadline, parties.lease_end + GRACE_PERIOD);
    assert_eq!(agreement.status, Status::AwaitingFunds);
    assert_eq!(agreement.evidence, None);
    assert_eq!(client.arbiter(), Some(parties.arbiter));
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn constructor_rechaza_monto_cero() {
    let env = Env::default();
    env.ledger().set_timestamp(START);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token = Address::generate(&env);

    env.register(
        DepositoSeguro,
        (
            &tenant,
            &landlord,
            &arbiter,
            &token,
            &0_i128,
            &(START + DAY),
        ),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn constructor_rechaza_plazo_pasado() {
    let env = Env::default();
    env.ledger().set_timestamp(START);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token = Address::generate(&env);

    env.register(
        DepositoSeguro,
        (&tenant, &landlord, &arbiter, &token, &DEPOSIT, &START),
    );
}

// ── Fondeo ─────────────────────────────────────────────────────────────────

#[test]
fn fund_mueve_el_deposito_al_contrato() {
    let (_env, client, parties) = setup();
    let token = token(&_env, &parties);

    client.fund();

    assert_eq!(token.balance(&parties.tenant), 0);
    assert_eq!(token.balance(&client.address), DEPOSIT);
    assert_eq!(client.status(), Status::Active);
}

#[test]
fn no_se_fondea_dos_veces() {
    let (_env, client, _parties) = setup();

    client.fund();

    assert_eq!(client.try_fund(), Err(Ok(Error::AlreadyFunded)));
}

#[test]
fn fund_exige_la_firma_del_inquilino() {
    let (env, client, _parties) = setup();

    // set_auths(&[]) apaga el mock_all_auths: nadie firmó.
    env.set_auths(&[]);
    assert!(client.try_fund().is_err());
    assert_eq!(client.status(), Status::AwaitingFunds);
}

// ── Acuerdo entre las partes ───────────────────────────────────────────────

#[test]
fn settle_reparte_el_deposito_y_cierra() {
    let (_env, client, parties) = setup();
    let token = token(&_env, &parties);

    client.fund();
    client.settle(&REFUND);

    assert_eq!(token.balance(&parties.tenant), REFUND);
    assert_eq!(token.balance(&parties.landlord), DEPOSIT - REFUND);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(client.status(), Status::Closed);
}

#[test]
fn settle_rechaza_repartos_invalidos() {
    let (_env, client, _parties) = setup();

    client.fund();

    assert_eq!(
        client.try_settle(&(DEPOSIT + 1)),
        Err(Ok(Error::InvalidSplit))
    );
    assert_eq!(client.try_settle(&-1), Err(Ok(Error::InvalidSplit)));
}

#[test]
fn settle_tambien_resuelve_una_disputa() {
    let (env, client, parties) = setup();
    let token = token(&env, &parties);

    client.fund();
    env.ledger().set_timestamp(parties.lease_end + 1);
    client.dispute(&evidence(&env));
    client.settle(&REFUND);

    assert_eq!(token.balance(&parties.tenant), REFUND);
    assert_eq!(token.balance(&parties.landlord), DEPOSIT - REFUND);
    assert_eq!(client.status(), Status::Closed);
}

// ── Devolución automática a los 15 días ────────────────────────────────────

#[test]
fn claim_espera_los_quince_dias() {
    let (env, client, parties) = setup();
    let token = token(&env, &parties);

    client.fund();

    // El contrato terminó, pero todavía no venció el plazo.
    env.ledger().set_timestamp(parties.lease_end);
    assert_eq!(client.try_claim(), Err(Ok(Error::TooEarly)));

    // Al cumplirse los 15 días, el inquilino recupera todo.
    env.ledger().set_timestamp(parties.lease_end + GRACE_PERIOD);
    client.claim();

    assert_eq!(token.balance(&parties.tenant), DEPOSIT);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(client.status(), Status::Closed);
}

// ── Disputa y arbitraje ────────────────────────────────────────────────────

#[test]
fn disputa_exige_la_firma_del_arrendador() {
    let (env, client, parties) = setup();

    client.fund();
    env.ledger().set_timestamp(parties.lease_end + 1);

    env.set_auths(&[]);
    assert!(client.try_dispute(&evidence(&env)).is_err());
    assert_eq!(client.status(), Status::Active);
}

#[test]
fn claim_exige_la_firma_del_inquilino() {
    let (env, client, parties) = setup();

    client.fund();
    env.ledger().set_timestamp(parties.lease_end + GRACE_PERIOD);

    env.set_auths(&[]);
    assert!(client.try_claim().is_err());
    assert_eq!(client.status(), Status::Active);
}

#[test]
fn disputa_bloquea_el_claim() {
    let (env, client, parties) = setup();

    client.fund();
    env.ledger().set_timestamp(parties.lease_end + 1);
    let proof = evidence(&env);
    client.dispute(&proof);

    assert_eq!(client.status(), Status::Disputed);
    assert_eq!(client.agreement().evidence, Some(proof));
    assert_eq!(client.try_claim(), Err(Ok(Error::InvalidState)));
}

#[test]
fn disputa_antes_del_fin_del_contrato_falla() {
    let (env, client, parties) = setup();

    client.fund();
    env.ledger().set_timestamp(parties.lease_end - 1);

    assert_eq!(
        client.try_dispute(&evidence(&env)),
        Err(Ok(Error::TooEarly))
    );
}

#[test]
fn disputa_despues_del_plazo_falla() {
    let (env, client, parties) = setup();

    client.fund();
    env.ledger().set_timestamp(parties.lease_end + GRACE_PERIOD);

    assert_eq!(
        client.try_dispute(&evidence(&env)),
        Err(Ok(Error::DeadlinePassed))
    );
}

#[test]
fn arbitro_decide_el_reparto() {
    let (env, client, parties) = setup();
    let token = token(&env, &parties);

    client.fund();
    env.ledger().set_timestamp(parties.lease_end + 1);
    client.dispute(&evidence(&env));
    client.resolve(&ARBITER_REFUND);

    assert_eq!(token.balance(&parties.tenant), ARBITER_REFUND);
    assert_eq!(token.balance(&parties.landlord), DEPOSIT - ARBITER_REFUND);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(client.status(), Status::Closed);
}

#[test]
fn resolve_sin_disputa_falla() {
    let (_env, client, _parties) = setup();

    client.fund();

    assert_eq!(client.try_resolve(&0), Err(Ok(Error::NotDisputed)));
}

#[test]
fn resolve_exige_la_firma_del_arbitro() {
    let (env, client, parties) = setup();

    client.fund();
    env.ledger().set_timestamp(parties.lease_end + 1);
    client.dispute(&evidence(&env));

    // set_auths(&[]) apaga el mock_all_auths: nadie firmó.
    env.set_auths(&[]);
    assert!(client.try_resolve(&0).is_err());
}

// ── Storage ────────────────────────────────────────────────────────────────

#[test]
fn renueva_el_ttl() {
    let (env, client, _parties) = setup();

    client.fund();

    let ttl = env.as_contract(&client.address, || {
        env.storage().persistent().get_ttl(&DataKey::Agreement)
    });
    assert_eq!(ttl, TTL_EXTEND_TO);
}

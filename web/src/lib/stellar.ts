import {
  BASE_FEE,
  Contract,
  Networks,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { signTransaction as varialSign } from "@stellar/varial-sdk";

const env = import.meta.env;

export const RPC_URL = env.VITE_RPC_URL || "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;
export const DEFAULT_CONTRACT_ID =
  env.VITE_CONTRACT_ID || "CBOEEBM4MJQ425TV2JZNPCFH7S4YT7SEH3BUTBBEXFYA3HCGSBH4K6BP";
export const READ_SOURCE =
  env.VITE_READ_SOURCE || "GD6HOW6YNU4LVCQI7YBJHHVSSAY6XZENODBWSVOXVYC4HLLT6ZZFSV26";
export const NATIVE_TOKEN_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const server = new rpc.Server(RPC_URL);

export type Status = "AwaitingFunds" | "Active" | "Disputed" | "Closed";

export interface Agreement {
  tenant: string;
  landlord: string;
  token: string;
  amount: bigint;
  lease_end: bigint;
  claim_deadline: bigint;
  status: Status;
  evidence: Uint8Array | null;
}

export type ScVal = ReturnType<typeof nativeToScVal>;

const CONTRACT_ERRORS: Record<number, string> = {
  1: "El monto del depósito no es válido.",
  2: "La fecha de fin del alquiler no es válida.",
  3: "El inquilino, el arrendador y el mediador deben ser distintos.",
  4: "Este depósito ya fue depositado.",
  5: "El acuerdo no está en el estado correcto para esa acción.",
  6: "Todavía no llegó la fecha para hacer eso.",
  7: "El plazo de 15 días ya venció.",
  8: "No hay un reclamo abierto.",
  9: "El reparto no es válido: debe estar entre 0 y el depósito.",
  10: "El acuerdo todavía no está listo.",
};

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(String(value));
}

function normalizeStatus(value: unknown): Status {
  const raw = Array.isArray(value) ? value[0] : value;
  const status = String(raw) as Status;
  if (status === "AwaitingFunds" || status === "Active" || status === "Disputed" || status === "Closed") {
    return status;
  }
  return "AwaitingFunds";
}

function normalizeAgreement(value: Record<string, unknown>): Agreement {
  const evidence = value.evidence;
  return {
    tenant: String(value.tenant),
    landlord: String(value.landlord),
    token: String(value.token),
    amount: toBigInt(value.amount),
    lease_end: toBigInt(value.lease_end),
    claim_deadline: toBigInt(value.claim_deadline),
    status: normalizeStatus(value.status),
    evidence:
      evidence instanceof Uint8Array
        ? evidence
        : Array.isArray(evidence)
          ? Uint8Array.from(evidence)
          : null,
  };
}

async function readValue(
  contractId: string,
  method: string,
  args: ScVal[] = [],
  source = READ_SOURCE,
): Promise<unknown> {
  const account = await server.getAccount(source);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }
  if (!simulation.result) {
    throw new Error("No pudimos leer el acuerdo.");
  }
  return scValToNative(simulation.result.retval);
}

export async function readAgreement(contractId = DEFAULT_CONTRACT_ID): Promise<Agreement> {
  const raw = await readValue(contractId, "agreement");
  return normalizeAgreement(raw as Record<string, unknown>);
}

export async function readArbiter(contractId = DEFAULT_CONTRACT_ID): Promise<string | null> {
  const raw = await readValue(contractId, "arbiter");
  return raw ? String(raw) : null;
}

export interface InvokeResult {
  hash: string;
}

export async function invokeContract(
  contractId: string,
  method: string,
  args: ScVal[],
  address: string,
): Promise<InvokeResult> {
  const account = await server.getAccount(address);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  const signed = await varialSign(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });

  if (signed.error) {
    throw new Error(signed.error.message);
  }
  if (!signed.signedTxXdr) {
    throw new Error("No se pudo confirmar la operación desde Varial.");
  }

  const signedTx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    NETWORK_PASSPHRASE,
  ) as Transaction;

  const send = await server.sendTransaction(signedTx);
  if (send.status === "ERROR") {
    throw new Error("No se pudo completar la operación.");
  }
  if (send.status === "TRY_AGAIN_LATER") {
    throw new Error("El servicio está ocupado. Probá de nuevo en un momento.");
  }

  const result = await server.pollTransaction(send.hash, { attempts: 30 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    if (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      throw new Error("La operación todavía no se confirmó. Probá de nuevo en un momento.");
    }
    throw new Error("La operación no se completó.");
  }

  return { hash: send.hash };
}

export function bytesFromHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("El documento no se pudo procesar. Probá con otro archivo.");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function bytesValue(bytes: Uint8Array): ScVal {
  return nativeToScVal(bytes, { type: "bytes" });
}

export function i128Value(value: bigint): ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function formatDate(timestamp: bigint): string {
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(timestamp) * 1000));
}

export function formatAmount(value: bigint, maxDecimals = 2): string {
  return new Intl.NumberFormat("es-CR", {
    maximumFractionDigits: maxDecimals,
  }).format(Number(value) / 10_000_000);
}

export function timeLeft(target: bigint, now: number): string {
  const seconds = Number(target) - now;
  if (seconds <= 0) return "ahora";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  const secs = seconds % 60;
  return `${minutes} min ${secs} s`;
}

export function humanizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const contractError = message.match(/Error\(Contract, #(\d+)\)/);
  if (contractError) {
    const code = Number(contractError[1]);
    return CONTRACT_ERRORS[code] ?? "La operación no se pudo completar.";
  }
  if (/user (rejected|declined|canceled)/i.test(message)) {
    return "No confirmaste la operación en Varial.";
  }
  if (/Error\(Auth|unauthorized|not authorized/i.test(message)) {
    return "La cuenta conectada no tiene permiso para esta acción.";
  }
  if (/insufficient|balance/i.test(message)) {
    return "Saldo insuficiente para cubrir el depósito y los costos de la operación.";
  }
  if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(message)) {
    return "No se pudo conectar con el servicio. Revisá tu conexión.";
  }
  return "No se pudo completar la operación. Revisá tu cuenta e intentá de nuevo.";
}

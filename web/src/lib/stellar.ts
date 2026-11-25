import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
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
export const TOKEN_ID = env.VITE_TOKEN_ID || NATIVE_TOKEN_ID;
export const MEDIATOR_ADDRESS =
  env.VITE_MEDIATOR_ADDRESS ||
  "GD37NNKAUCJEIHHLQREFVHJ2NWQOWQZJBK44FR7JQB7G4MALO42RHFW4";
export const WASM_URL = "/deposito_seguro.wasm";

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

type StellarOperation = ReturnType<typeof Operation.createCustomContract>;

interface SubmitResult {
  hash: string;
  returnValue: unknown;
}

async function signAndSubmit(
  prepared: Transaction,
  address: string,
): Promise<SubmitResult> {
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

  return {
    hash: send.hash,
    returnValue: "returnValue" in result ? result.returnValue : undefined,
  };
}

async function submitOperation(
  operation: StellarOperation,
  address: string,
): Promise<SubmitResult> {
  const account = await server.getAccount(address);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(120)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return signAndSubmit(prepared, address);
}

export async function invokeContract(
  contractId: string,
  method: string,
  args: ScVal[],
  address: string,
): Promise<InvokeResult> {
  const contract = new Contract(contractId);
  const result = await submitOperation(
    contract.call(method, ...args) as StellarOperation,
    address,
  );
  return { hash: result.hash };
}

export interface CreateAgreementInput {
  landlord: string;
  tenant: string;
  amount: bigint;
  leaseEnd: bigint;
}

export async function deployAgreement(
  input: CreateAgreementInput,
): Promise<string> {
  if (!StrKey.isValidEd25519PublicKey(input.tenant)) {
    throw new Error("La cuenta del inquilino no es válida.");
  }
  if (input.tenant.toUpperCase() === input.landlord.toUpperCase()) {
    throw new Error("El inquilino no puede ser la misma cuenta que el arrendador.");
  }
  if (input.amount <= 0n) {
    throw new Error("El monto del depósito debe ser mayor que cero.");
  }
  if (input.leaseEnd <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error("La fecha de fin del alquiler tiene que ser futura.");
  }

  const wasmResponse = await fetch(WASM_URL);
  if (!wasmResponse.ok) {
    throw new Error("No se pudo cargar el modelo del acuerdo.");
  }
  const wasm = new Uint8Array(await wasmResponse.arrayBuffer());
  const wasmHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", wasm),
  );

  let installed = true;
  try {
    await server.getContractWasmByHash(wasmHash);
  } catch {
    installed = false;
  }

  if (!installed) {
    await submitOperation(
      Operation.uploadContractWasm({ wasm }) as StellarOperation,
      input.landlord,
    );
  }

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const constructorArgs = [
    new Address(input.tenant).toScVal(),
    new Address(input.landlord).toScVal(),
    new Address(MEDIATOR_ADDRESS).toScVal(),
    new Address(TOKEN_ID).toScVal(),
    nativeToScVal(input.amount, { type: "i128" }),
    nativeToScVal(input.leaseEnd, { type: "u64" }),
  ];

  const deployed = await submitOperation(
    Operation.createCustomContract({
      address: new Address(input.landlord),
      wasmHash,
      constructorArgs,
      salt,
    }) as StellarOperation,
    input.landlord,
  );

  const contractId = scValToNative(deployed.returnValue as xdr.ScVal);
  if (typeof contractId !== "string") {
    throw new Error("No pudimos identificar el acuerdo creado.");
  }
  return contractId;
}

export function xlmToStroops(value: string): bigint {
  const clean = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,7})?$/.test(clean)) {
    throw new Error("Escribí un monto válido, con hasta 7 decimales.");
  }
  const [whole, fraction = ""] = clean.split(".");
  return (
    BigInt(whole) * 10_000_000n +
    BigInt((fraction + "0000000").slice(0, 7))
  );
}

export function endOfDayUnix(date: string): bigint {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Elegí una fecha de fin válida.");
  }
  return BigInt(
    Math.floor(new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000),
  );
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
  if (
    /^(La cuenta|El inquilino|El monto|La fecha|No se pudo cargar|No pudimos|Escribí|Elegí)/.test(
      message,
    )
  ) {
    return message;
  }
  return "No se pudo completar la operación. Revisá tu cuenta e intentá de nuevo.";
}

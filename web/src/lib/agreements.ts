const STORAGE_KEY = "deposito-seguro:saved-agreements:v1";

type SavedMap = Record<string, string[]>;

function readMap(): SavedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: SavedMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Si el navegador bloquea storage, la sesión actual sigue funcionando.
  }
}

function keyFor(address: string): string {
  return address.toUpperCase();
}

export function getSavedAgreements(address: string): string[] {
  const map = readMap();
  return map[keyFor(address)] ?? [];
}

export function saveAgreement(address: string, contractId: string): string[] {
  const map = readMap();
  const key = keyFor(address);
  const current = map[key] ?? [];
  const next = current.includes(contractId) ? current : [...current, contractId];
  map[key] = next;
  writeMap(map);
  return next;
}

export function removeAgreement(address: string, contractId: string): string[] {
  const map = readMap();
  const key = keyFor(address);
  const next = (map[key] ?? []).filter((item) => item !== contractId);
  map[key] = next;
  writeMap(map);
  return next;
}

export function parseAgreementInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("contract");
    if (fromQuery && /^C[A-Z2-7]{55}$/i.test(fromQuery)) {
      return fromQuery.toUpperCase();
    }
  } catch {
    // No es una URL; seguimos con el código.
  }

  const match = value.match(/C[A-Z2-7]{55}/i);
  return match ? match[0].toUpperCase() : null;
}

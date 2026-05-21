const KEY = "theorise_recent_deposits";
const FRICTION_WINDOW_MS = 60 * 60 * 1000;

type RecentMap = Record<string, number>;

function read(): RecentMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RecentMap;
  } catch {
    return {};
  }
}

function write(data: RecentMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* localStorage may be unavailable; non-fatal */
  }
}

export function getLastDepositTime(creatorId: string): number | null {
  const data = read();
  const ts = data[creatorId];
  if (typeof ts !== "number") return null;
  if (Date.now() - ts > FRICTION_WINDOW_MS) return null;
  return ts;
}

export function hasRecentDeposit(creatorId: string): boolean {
  return getLastDepositTime(creatorId) !== null;
}

export function recordDeposit(creatorId: string) {
  const data = read();
  data[creatorId] = Date.now();
  write(data);
}

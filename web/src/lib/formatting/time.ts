const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(target: Date | number, now: Date | number = Date.now()) {
  const t = typeof target === "number" ? target : target.getTime();
  const n = typeof now === "number" ? now : now.getTime();
  const diff = t - n;
  const abs = Math.abs(diff);
  const sign = diff < 0 ? "ago" : "from now";

  if (abs < MINUTE) return diff < 0 ? "just now" : "in a moment";
  if (abs < HOUR) return `${Math.round(abs / MINUTE)}m ${sign}`;
  if (abs < DAY) return `${Math.round(abs / HOUR)}h ${sign}`;
  return `${Math.round(abs / DAY)}d ${sign}`;
}

export function formatDuration(ms: number) {
  if (ms < MINUTE) return `${Math.round(ms / SECOND)}s`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  return `${Math.round(ms / DAY)}d`;
}

export function formatCountdown(targetMs: number, nowMs: number = Date.now()) {
  const diff = Math.max(0, targetMs - nowMs);
  const h = Math.floor(diff / HOUR);
  const m = Math.floor((diff % HOUR) / MINUTE);
  const s = Math.floor((diff % MINUTE) / SECOND);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

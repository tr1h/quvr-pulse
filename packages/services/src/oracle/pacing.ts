export const ORACLE_INTERVAL_MS = 10 * 60_000;
export const ORACLE_WINDOWS_PER_DAY = 144;

/** Split the daily allowance across UTC ten-minute windows. Unused slots do not accumulate. */
export function oracleWindow(cap: number, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00.000Z`);
  const slot = Math.floor((now.getTime() - midnight) / ORACLE_INTERVAL_MS);
  const base = Math.floor(cap / ORACLE_WINDOWS_PER_DAY);
  const extra = cap % ORACLE_WINDOWS_PER_DAY;
  return {
    day,
    start: new Date(midnight + slot * ORACLE_INTERVAL_MS),
    end: new Date(midnight + (slot + 1) * ORACLE_INTERVAL_MS),
    allowance:
      base +
      Math.floor(((slot + 1) * extra) / ORACLE_WINDOWS_PER_DAY) -
      Math.floor((slot * extra) / ORACLE_WINDOWS_PER_DAY),
  };
}

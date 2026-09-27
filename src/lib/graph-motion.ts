export const FLIGHT_DURATION = 1100;
export const flightProgress = (elapsed: number) => {
  const t = Math.max(0, Math.min(1, elapsed / FLIGHT_DURATION));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** Frame-rate-independent fade, including quick direction reversals. */
export function fadeVisibility(current: number, target: number, delta: number) {
  const next = target + (current - target) * Math.exp(-6 * delta);
  return Math.abs(next - target) < 0.005 ? target : next;
}

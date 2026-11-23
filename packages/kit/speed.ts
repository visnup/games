/** How long each of others' plays shows before the next, in ms, or 0 for all at once. */
export const SPEEDS = { off: 0, fast: 400, slow: 900 };
export type Speed = keyof typeof SPEEDS;

/** This browser's speed, as last chosen in the lobby. */
export function stepSpeed(): Speed {
  try {
    const s = localStorage.getItem("step");
    return s && s in SPEEDS ? (s as Speed) : "fast";
  } catch {
    return "fast";
  }
}

export function setStepSpeed(s: Speed) {
  try {
    localStorage.setItem("step", s);
  } catch {}
}

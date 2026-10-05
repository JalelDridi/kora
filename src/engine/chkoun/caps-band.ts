// Caps bands (D-S2-13). No imports: the pipeline uses this too (D-S2-6).

export const CAPS_BAND_FLOORS = [0, 1, 10, 30, 60] as const;

export function capsBand(caps: number): 0 | 1 | 2 | 3 | 4 {
  if (caps >= 60) return 4;
  if (caps >= 30) return 3;
  if (caps >= 10) return 2;
  if (caps >= 1) return 1;
  return 0;
}

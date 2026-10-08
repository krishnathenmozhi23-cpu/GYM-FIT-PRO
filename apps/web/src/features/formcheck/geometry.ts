/** 2D pose geometry. Points are in a square-pixel space (x scaled by aspect ratio, y down). */

export interface Pt {
  x: number;
  y: number;
}

/** MediaPipe Pose landmark indices (33-point model). */
export const L = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

export const SIDE = {
  left: { shoulder: L.leftShoulder, elbow: L.leftElbow, wrist: L.leftWrist, hip: L.leftHip, knee: L.leftKnee, ankle: L.leftAnkle, heel: L.leftHeel, foot: L.leftFoot },
  right: { shoulder: L.rightShoulder, elbow: L.rightElbow, wrist: L.rightWrist, hip: L.rightHip, knee: L.rightKnee, ankle: L.rightAnkle, heel: L.rightHeel, foot: L.rightFoot },
} as const;
export type Side = keyof typeof SIDE;

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Interior angle ABC at B, in degrees (0–180). */
export function angle(a: Pt, b: Pt, c: Pt): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const n = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (n === 0) return 180;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / n));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of the segment bottom→top from straight up, in degrees (0 = vertical, 90 = horizontal). */
export function fromVertical(top: Pt, bottom: Pt): number {
  const dx = top.x - bottom.x;
  const dy = bottom.y - top.y; // up is positive
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

/**
 * Signed horizontal offset direction of `top` relative to `bottom` as an
 * angle from vertical: positive when `top` is on the `facing` side.
 */
export function signedLean(top: Pt, bottom: Pt, facing: 1 | -1): number {
  const dx = (top.x - bottom.x) * facing;
  const dy = bottom.y - top.y;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

/** Is `p` below (greater y) the straight line through a and b, evaluated at p.x? */
export function belowLine(p: Pt, a: Pt, b: Pt): boolean {
  if (Math.abs(b.x - a.x) < 1e-6) return p.y > (a.y + b.y) / 2;
  const t = (p.x - a.x) / (b.x - a.x);
  return p.y > a.y + t * (b.y - a.y);
}

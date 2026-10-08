import type { PoseFrame } from "./analyzer";
import { L } from "./geometry";

/**
 * Builds a 33-landmark pose from joint angles (forward kinematics), in the
 * same normalized format MediaPipe returns. Used for the animated form
 * guides and to test the analyzer with realistic movement.
 *
 * Angles are absolute, in degrees from straight up, positive = toward the
 * direction the person faces. Lengths are fractions of image height.
 */
export interface SidePose {
  /** Where the ankle sits. */
  origin: { x: number; y: number };
  shin: number;
  thigh: number;
  torso: number;
  upperArm: number;
  forearm: number;
  facing?: 1 | -1;
}

const LEN = { shin: 0.22, thigh: 0.22, torso: 0.28, upperArm: 0.15, forearm: 0.14, head: 0.07, foot: 0.06 };

function step(p: { x: number; y: number }, deg: number, len: number, facing: number) {
  const r = (deg * Math.PI) / 180;
  return { x: p.x + Math.sin(r) * len * facing, y: p.y - Math.cos(r) * len };
}

function blank(): PoseFrame["landmarks"] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.05 }));
}

/** Side view: both sides overlap with a tiny offset, like a real side-on camera. */
export function sidePose(p: SidePose): PoseFrame["landmarks"] {
  const f = p.facing ?? 1;
  // Built upward from the ankle. For push-ups/planks use near-horizontal
  // shin/thigh/torso angles (~75–90°) and let the arms hang to the floor.
  const ankle = p.origin;
  const knee = step(ankle, p.shin, LEN.shin, f);
  const hip = step(knee, p.thigh, LEN.thigh, f);
  const shoulder = step(hip, p.torso, LEN.torso, f);
  const elbow = step(shoulder, p.upperArm + 180, LEN.upperArm, f);
  const wrist = step(elbow, p.forearm + 180, LEN.forearm, f);
  // The nose sits a few cm in front of the shoulder line, as on a real person.
  const headTop = step(shoulder, p.torso, LEN.head, f);
  const head = { x: headTop.x + 0.03 * f, y: headTop.y };
  const heel = { x: ankle.x - 0.02 * f, y: ankle.y + 0.01 };
  const foot = { x: ankle.x + LEN.foot * f, y: ankle.y + 0.01 };
  const lm = blank();
  const put = (i: number, q: { x: number; y: number }, dx = 0) => (lm[i] = { x: q.x + dx, y: q.y, visibility: 0.95 });
  put(L.nose, head);
  for (const [dx, s] of [[0, "left"], [0.004, "right"]] as const) {
    const o = s === "left";
    put(o ? L.leftShoulder : L.rightShoulder, shoulder, dx);
    put(o ? L.leftElbow : L.rightElbow, elbow, dx);
    put(o ? L.leftWrist : L.rightWrist, wrist, dx);
    put(o ? L.leftHip : L.rightHip, hip, dx);
    put(o ? L.leftKnee : L.rightKnee, knee, dx);
    put(o ? L.leftAnkle : L.rightAnkle, ankle, dx);
    put(o ? L.leftHeel : L.rightHeel, heel, dx);
    put(o ? L.leftFoot : L.rightFoot, foot, dx);
  }
  return lm;
}

/**
 * Front view (facing the camera). `drop` lowers the hips (0 = standing,
 * 1 = deep squat); `kneeIn` moves the knees toward the midline (valgus);
 * `armRaise` is shoulder abduction in degrees; `tilt` leans the torso sideways.
 */
export function frontPose(o: { drop?: number; kneeIn?: number; armRaise?: number; tilt?: number; cx?: number }): PoseFrame["landmarks"] {
  const cx = o.cx ?? 0.5;
  const drop = o.drop ?? 0;
  const ankleY = 0.9;
  const legLen = LEN.shin + LEN.thigh;
  const hipY = ankleY - legLen * (1 - 0.45 * drop);
  const kneeY = ankleY - LEN.shin * (1 - 0.15 * drop);
  const stance = 0.09;
  const hipW = 0.06;
  const kneeOut = stance * (1 - (o.kneeIn ?? 0));
  const tiltDx = Math.sin(((o.tilt ?? 0) * Math.PI) / 180) * LEN.torso;
  const shoulderY = hipY - LEN.torso;
  const shoulderW = 0.09;
  const lm = blank();
  const put = (i: number, x: number, y: number) => (lm[i] = { x, y, visibility: 0.95 });
  const raise = ((o.armRaise ?? 10) * Math.PI) / 180;
  for (const s of [-1, 1] as const) {
    const left = s === 1; // person's left appears on image right
    const sx = cx + s * shoulderW + tiltDx;
    put(left ? L.leftShoulder : L.rightShoulder, sx, shoulderY);
    const ex = sx + s * Math.sin(raise) * LEN.upperArm;
    const ey = shoulderY + Math.cos(raise) * LEN.upperArm;
    put(left ? L.leftElbow : L.rightElbow, ex, ey);
    put(left ? L.leftWrist : L.rightWrist, ex + s * Math.sin(raise) * LEN.forearm, ey + Math.cos(raise) * LEN.forearm);
    put(left ? L.leftHip : L.rightHip, cx + s * hipW, hipY);
    put(left ? L.leftKnee : L.rightKnee, cx + s * kneeOut, kneeY);
    put(left ? L.leftAnkle : L.rightAnkle, cx + s * stance, ankleY);
    put(left ? L.leftHeel : L.rightHeel, cx + s * stance, ankleY + 0.01);
    put(left ? L.leftFoot : L.rightFoot, cx + s * (stance + 0.02), ankleY + 0.02);
  }
  put(L.nose, cx + tiltDx * 1.2, shoulderY - LEN.head);
  return lm;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth (cosine) interpolation between pose keyframes, for animation and tests. */
export function tween<T extends Record<string, number>>(a: T, b: T, t: number): T {
  const e = (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof T)[]) out[k] = lerp(a[k] as number, b[k] as number, e) as T[keyof T];
  return out;
}

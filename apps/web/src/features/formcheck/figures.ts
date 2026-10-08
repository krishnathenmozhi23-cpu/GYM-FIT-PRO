/**
 * Animated stick-figure demonstrations for exercises that have no
 * demonstration photos. Unlike the analyzer skeleton (one leg/arm in side
 * view), every limb moves independently here, so alternating movements
 * (high knees, bird dog, step jacks) can be shown.
 *
 * Angles are in degrees. Torso: from straight up. Limbs: from straight down.
 * Side view: positive = forward (the way the person faces). Front view:
 * positive = out to that side. The figure is always grounded: after the pose
 * is built it is shifted so its lowest point touches the floor (minus `air`).
 */

export interface FigureKey {
  torso: number;
  /** Near (left in front view) and far (right) legs. */
  thighA: number;
  shinA: number;
  thighB: number;
  shinB: number;
  upperA: number;
  foreA: number;
  upperB: number;
  foreB: number;
  /** Lift off the floor (jumps), in figure units. */
  air: number;
}

export interface Figure {
  view: "side" | "front";
  keys: FigureKey[];
  caption: string;
}

export interface FigurePoint {
  x: number;
  y: number;
}

export interface FigurePose {
  head: FigurePoint;
  neck: FigurePoint;
  hip: FigurePoint;
  /** [A, B] limbs, each as joint chains. */
  legs: [FigurePoint[], FigurePoint[]];
  arms: [FigurePoint[], FigurePoint[]];
}

const LEN = { torso: 0.3, thigh: 0.24, shin: 0.23, upper: 0.16, fore: 0.15, neck: 0.04, head: 0.055 };
export const FLOOR_Y = 0.92;

const base: FigureKey = { torso: 0, thighA: 0, shinA: 0, thighB: 0, shinB: 0, upperA: 6, foreA: 6, upperB: 6, foreB: 6, air: 0 };
const k = (o: Partial<FigureKey>): FigureKey => ({ ...base, ...o });

export const FIGURES: Record<string, Figure> = {
  "jumping-jacks": {
    view: "front",
    keys: [
      k({ thighA: 3, shinA: 3, thighB: 3, shinB: 3 }),
      k({ thighA: 20, shinA: 20, thighB: 20, shinB: 20, upperA: 160, foreA: 168, upperB: 160, foreB: 168 }),
      k({ thighA: 3, shinA: 3, thighB: 3, shinB: 3 }),
    ],
    caption: "Jump your feet out as your arms sweep overhead, then back together. Land softly.",
  },
  "step-jacks": {
    view: "front",
    keys: [
      k({ thighA: 3, shinA: 3, thighB: 3, shinB: 3 }),
      k({ thighA: 22, shinA: 22, thighB: 3, shinB: 3, upperA: 160, foreA: 168, upperB: 160, foreB: 168 }),
      k({ thighA: 3, shinA: 3, thighB: 3, shinB: 3 }),
      k({ thighA: 3, shinA: 3, thighB: 22, shinB: 22, upperA: 160, foreA: 168, upperB: 160, foreB: 168 }),
      k({ thighA: 3, shinA: 3, thighB: 3, shinB: 3 }),
    ],
    caption: "Step one foot out as your arms go up, step back in, then switch sides. No jumping.",
  },
  "high-knees": {
    view: "side",
    keys: [
      k({ torso: 4, thighA: 85, shinA: -5, thighB: -4, shinB: -6, upperA: -35, foreA: 40, upperB: 45, foreB: 120 }),
      k({ torso: 4, thighA: -4, shinA: -6, thighB: 85, shinB: -5, upperA: 45, foreA: 120, upperB: -35, foreB: 40 }),
      k({ torso: 4, thighA: 85, shinA: -5, thighB: -4, shinB: -6, upperA: -35, foreA: 40, upperB: 45, foreB: 120 }),
    ],
    caption: "Run in place, driving each knee up to hip height. Stay tall and pump your arms.",
  },
  burpee: {
    view: "side",
    keys: [
      k({}),
      k({ torso: 55, thighA: 95, shinA: -25, thighB: 95, shinB: -25, upperA: 25, foreA: 25, upperB: 25, foreB: 25 }),
      k({ torso: 82, thighA: -98, shinA: -98, thighB: -98, shinB: -98, upperA: 0, foreA: 0, upperB: 0, foreB: 0 }),
      k({ torso: 55, thighA: 95, shinA: -25, thighB: 95, shinB: -25, upperA: 25, foreA: 25, upperB: 25, foreB: 25 }),
      k({ upperA: 170, foreA: 175, upperB: 170, foreB: 175, air: 0.06 }),
      k({}),
    ],
    caption: "Squat, hands down, step or jump back to a plank, return to the squat, then stand or jump up.",
  },
  "bird-dog": {
    view: "side",
    keys: [
      k({ torso: 88, thighA: 0, shinA: -90, thighB: 0, shinB: -90, upperA: -2, foreA: -2, upperB: -2, foreB: -2 }),
      k({ torso: 88, thighA: 0, shinA: -90, thighB: -92, shinB: -92, upperA: 96, foreA: 96, upperB: -2, foreB: -2 }),
      k({ torso: 88, thighA: 0, shinA: -90, thighB: 0, shinB: -90, upperA: -2, foreA: -2, upperB: -2, foreB: -2 }),
      k({ torso: 88, thighA: -92, shinA: -92, thighB: 0, shinB: -90, upperA: -2, foreA: -2, upperB: 96, foreB: 96 }),
      k({ torso: 88, thighA: 0, shinA: -90, thighB: 0, shinB: -90, upperA: -2, foreA: -2, upperB: -2, foreB: -2 }),
    ],
    caption: "On hands and knees, reach one arm forward and the opposite leg back. Keep your back flat and hips level.",
  },
  "pike-push-up": {
    view: "side",
    keys: [
      k({ torso: 130, thighA: -48, shinA: -48, thighB: -48, shinB: -48, upperA: 50, foreA: 50, upperB: 50, foreB: 50 }),
      k({ torso: 150, thighA: -36, shinA: -36, thighB: -36, shinB: -36, upperA: -10, foreA: 55, upperB: -10, foreB: 55 }),
      k({ torso: 130, thighA: -48, shinA: -48, thighB: -48, shinB: -48, upperA: 50, foreA: 50, upperB: 50, foreB: 50 }),
    ],
    caption: "Hips high in an upside-down V. Bend your elbows to lower your head toward the floor, then press back up.",
  },
  "shadow-boxing": {
    view: "side",
    keys: [
      k({ torso: 6, thighA: 14, shinA: 0, thighB: -16, shinB: -8, upperA: 30, foreA: 150, upperB: 25, foreB: 160 }),
      k({ torso: 8, thighA: 14, shinA: 0, thighB: -16, shinB: -8, upperA: 88, foreA: 90, upperB: 25, foreB: 160 }),
      k({ torso: 6, thighA: 14, shinA: 0, thighB: -16, shinB: -8, upperA: 30, foreA: 150, upperB: 25, foreB: 160 }),
      k({ torso: 12, thighA: 14, shinA: 0, thighB: -16, shinB: -8, upperA: 30, foreA: 150, upperB: 88, foreB: 90 }),
      k({ torso: 6, thighA: 14, shinA: 0, thighB: -16, shinB: -8, upperA: 30, foreA: 150, upperB: 25, foreB: 160 }),
    ],
    caption: "Stay light on your feet with hands up by your chin. Punch out and snap straight back to guard.",
  },
};

const rad = (d: number) => (d * Math.PI) / 180;

function limb(from: FigurePoint, deg: number, len: number, dir: number): FigurePoint {
  return { x: from.x + Math.sin(rad(deg)) * len * dir, y: from.y + Math.cos(rad(deg)) * len };
}

/** Joint positions for one keyframe (normalized units, y down). */
export function buildFigure(view: Figure["view"], p: FigureKey): FigurePose {
  const hip = { x: 0.5, y: 0.5 };
  const neck = { x: hip.x + Math.sin(rad(p.torso)) * LEN.torso, y: hip.y - Math.cos(rad(p.torso)) * LEN.torso };
  const head = { x: neck.x + Math.sin(rad(p.torso)) * (LEN.neck + LEN.head), y: neck.y - Math.cos(rad(p.torso)) * (LEN.neck + LEN.head) };
  // Front view: A limbs go to image right, B to image left, with hip/shoulder width.
  const dirA = 1;
  const dirB = view === "front" ? -1 : 1;
  const hw = view === "front" ? 0.055 : 0;
  const sw = view === "front" ? 0.085 : 0;
  const chain = (root: FigurePoint, a1: number, l1: number, a2: number, l2: number, dir: number) => {
    const j = limb(root, a1, l1, dir);
    return [root, j, limb(j, a2, l2, dir)];
  };
  const legA = chain({ x: hip.x + hw, y: hip.y }, p.thighA, LEN.thigh, p.shinA, LEN.shin, dirA);
  const legB = chain({ x: hip.x - hw, y: hip.y }, p.thighB, LEN.thigh, p.shinB, LEN.shin, dirB);
  const shoulderA = { x: neck.x + sw, y: neck.y + 0.02 };
  const shoulderB = { x: neck.x - sw, y: neck.y + 0.02 };
  const armA = chain(shoulderA, p.upperA, LEN.upper, p.foreA, LEN.fore, dirA);
  const armB = chain(shoulderB, p.upperB, LEN.upper, p.foreB, LEN.fore, dirB);

  // Ground the figure: lowest foot/hand/knee touches the floor.
  const all = [...legA, ...legB, ...armA, ...armB, head];
  const lowest = Math.max(...all.map((q) => q.y));
  const dy = FLOOR_Y - lowest - p.air;
  const mv = (q: FigurePoint) => ({ x: q.x, y: q.y + dy });
  return {
    head: mv(head),
    neck: mv(neck),
    hip: mv(hip),
    legs: [legA.map(mv), legB.map(mv)],
    arms: [armA.map(mv), armB.map(mv)],
  };
}

const ease = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;

export const FIGURE_SEGMENT_MS = 900;

/** Interpolated pose at time t (ms), looping through the keyframes. */
export function figureAt(fig: Figure, t: number): FigurePose {
  const n = fig.keys.length - 1;
  const pos = (Math.max(0, t) / FIGURE_SEGMENT_MS) % n;
  const i = Math.min(Math.floor(pos), n - 1);
  const a = fig.keys[i]!, b = fig.keys[i + 1]!;
  const e = ease(pos - i);
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof FigureKey)[]) out[key] = a[key] + (b[key] - a[key]) * e;
  return buildFigure(fig.view, out);
}

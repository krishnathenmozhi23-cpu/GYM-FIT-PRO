import type { FormProfileId } from "@gymfit/shared";

/** Joint angles for side-view poses (see skeleton.ts). */
export interface SideAngles {
  shin: number;
  thigh: number;
  torso: number;
  upperArm: number;
  forearm: number;
  [k: string]: number;
}
/** Parameters for front-view poses (see skeleton.ts). */
export interface FrontParams {
  drop: number;
  kneeIn: number;
  armRaise: number;
  tilt: number;
  [k: string]: number;
}

export type Guide =
  | { view: "side"; keys: SideAngles[]; caption: string }
  | { view: "front"; keys: FrontParams[]; caption: string };

const arms = { upperArm: 0, forearm: 0 };
const stand: SideAngles = { shin: 0, thigh: 0, torso: 0, ...arms };

/**
 * Reference movements for the animated form guides. Each loops
 * start → end → start. These same keyframes are run through the analyzer in
 * tests, so every guide is guaranteed to pass its own form check.
 */
export const GUIDES: Record<FormProfileId, Guide> = {
  squat: { view: "side", keys: [stand, { shin: 35, thigh: -80, torso: 45, ...arms }, stand], caption: "Sit hips back and down, chest up, knees tracking over toes." },
  lunge: { view: "side", keys: [stand, { shin: 20, thigh: -70, torso: 10, ...arms }, stand], caption: "Step back and lower straight down with a tall torso." },
  push_up: {
    view: "side",
    keys: [
      { shin: 80, thigh: 80, torso: 80, upperArm: 0, forearm: 0 },
      { shin: 86, thigh: 86, torso: 86, upperArm: -60, forearm: 30 },
      { shin: 80, thigh: 80, torso: 80, upperArm: 0, forearm: 0 },
    ],
    caption: "Body stays in one straight line from head to heels.",
  },
  hinge: { view: "side", keys: [stand, { shin: 5, thigh: -12, torso: 80, ...arms }, stand], caption: "Push hips back with soft knees and a flat back." },
  overhead_press: {
    view: "side",
    keys: [
      { ...stand, upperArm: 0, forearm: 160 },
      { ...stand, upperArm: 180, forearm: 180 },
      { ...stand, upperArm: 0, forearm: 160 },
    ],
    caption: "Press straight up to lockout without leaning back.",
  },
  biceps_curl: { view: "side", keys: [stand, { ...stand, forearm: 150 }, stand], caption: "Elbows pinned to your sides, body still." },
  lateral_raise: {
    view: "front",
    keys: [
      { drop: 0, kneeIn: 0, armRaise: 15, tilt: 0 },
      { drop: 0, kneeIn: 0, armRaise: 90, tilt: 0 },
      { drop: 0, kneeIn: 0, armRaise: 15, tilt: 0 },
    ],
    caption: "Raise out to the sides, stopping at shoulder height.",
  },
  plank: {
    view: "side",
    keys: [
      { shin: 85, thigh: 85, torso: 85, upperArm: 0, forearm: 0 },
      { shin: 85, thigh: 85, torso: 85, upperArm: 0, forearm: 0 },
    ],
    caption: "Hold a straight line — no sagging or piking.",
  },
  glute_bridge: {
    view: "side",
    keys: [
      { shin: -20, thigh: -130, torso: -90, ...arms },
      { shin: -20, thigh: -110, torso: -110, ...arms },
      { shin: -20, thigh: -130, torso: -90, ...arms },
    ],
    caption: "Drive through your heels until shoulders, hips and knees line up.",
  },
};

import { describe, expect, it } from "vitest";
import type { FormProfileId } from "@gymfit/shared";
import { FormAnalyzer, type AnalyzerEvent, type PoseFrame } from "./analyzer";
import { frontPose, sidePose, tween } from "./skeleton";
import { GUIDES } from "./guides";
import { FORM_PROFILES, FORM_PROFILE_DEFS } from "@gymfit/shared";

type Angles = { shin: number; thigh: number; torso: number; upperArm: number; forearm: number };
type Front = { drop: number; kneeIn: number; armRaise: number; tilt: number };

const FPS = 30;
const ORIGIN = { x: 0.5, y: 0.9 };

/** Deterministic pseudo-random jitter so tests are repeatable. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
}

interface Opts {
  jitter?: number;
  hideFrom?: number;
  hideTo?: number;
}

/** Builds frames that move through keyframes (each segment `msPer` long), repeated `reps` times. */
function sideFrames(keys: Angles[], reps: number, msPer = 900, o: Opts = {}): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const rand = rng(42);
  let t = 0;
  const pushPose = (a: Angles) => {
    const lm = sidePose({ origin: ORIGIN, ...a }).map((p, i) => ({
      ...p,
      x: p.x + (o.jitter ?? 0) * rand(),
      y: p.y + (o.jitter ?? 0) * rand(),
      visibility: o.hideFrom !== undefined && t >= o.hideFrom && t < (o.hideTo ?? Infinity) && i > 22 ? 0.1 : p.visibility,
    }));
    frames.push({ landmarks: lm, t, aspect: 1 });
    t += 1000 / FPS;
  };
  for (let i = 0; i < 10; i++) pushPose(keys[0]!); // settle at start
  for (let r = 0; r < reps; r++) {
    for (let k = 0; k < keys.length - 1; k++) {
      const n = Math.round((msPer / 1000) * FPS);
      for (let i = 0; i <= n; i++) pushPose(tween(keys[k]!, keys[k + 1]!, i / n));
    }
  }
  for (let i = 0; i < 10; i++) pushPose(keys[keys.length - 1]!);
  return frames;
}

function frontFrames(keys: Front[], reps: number, msPer = 900): PoseFrame[] {
  const frames: PoseFrame[] = [];
  let t = 0;
  const push = (a: Front) => {
    frames.push({ landmarks: frontPose(a), t, aspect: 1 });
    t += 1000 / FPS;
  };
  for (let i = 0; i < 10; i++) push(keys[0]!);
  for (let r = 0; r < reps; r++)
    for (let k = 0; k < keys.length - 1; k++) {
      const n = Math.round((msPer / 1000) * FPS);
      for (let i = 0; i <= n; i++) push(tween(keys[k]!, keys[k + 1]!, i / n));
    }
  return frames;
}

function run(profile: FormProfileId, frames: PoseFrame[]) {
  const a = new FormAnalyzer(profile);
  const events: AnalyzerEvent[] = [];
  for (const f of frames) events.push(...a.update(f));
  return { a, events, summary: a.summary(), codes: new Set(a.summary().issues.map((i) => i.code)) };
}

const ARMS_DOWN = { upperArm: 0, forearm: 0 };
const STAND: Angles = { shin: 0, thigh: 0, torso: 0, ...ARMS_DOWN };

describe("squat", () => {
  const good: Angles = { shin: 35, thigh: -80, torso: 45, ...ARMS_DOWN };
  it("counts clean reps from the side", () => {
    const r = run("squat", sideFrames([STAND, good, STAND], 5));
    expect(r.summary.reps).toBe(5);
    expect(r.summary.cleanReps).toBe(5);
    expect(r.summary.issues).toEqual([]);
  });

  it("flags excessive forward lean", () => {
    const r = run("squat", sideFrames([STAND, { ...good, torso: 72 }, STAND], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.codes).toEqual(new Set(["torso_lean"]));
    expect(r.summary.cleanReps).toBe(0);
  });

  it("gives a depth tip (not an error) for shallow reps", () => {
    const r = run("squat", sideFrames([STAND, { shin: 15, thigh: -40, torso: 25, ...ARMS_DOWN }, STAND], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.codes).toEqual(new Set(["shallow_depth"]));
    expect(r.summary.cleanReps).toBe(3); // tips don't make a rep unclean
  });

  it("flags knees caving in from the front as an injury risk", () => {
    const stand = { drop: 0, kneeIn: 0, armRaise: 10, tilt: 0 };
    const clean = run("squat", frontFrames([stand, { ...stand, drop: 1 }, stand], 3));
    expect(clean.summary.reps).toBe(3);
    expect(clean.summary.issues).toEqual([]);
    const valgus = run("squat", frontFrames([stand, { ...stand, drop: 1, kneeIn: 0.6 }, stand], 3));
    expect(valgus.summary.reps).toBe(3);
    expect(valgus.summary.issues).toEqual([{ code: "knees_caving", severity: "risk", count: 3 }]);
    expect(valgus.events.filter((e) => e.type === "issue")).toHaveLength(3); // cued once per rep
  });

  it("is robust to landmark jitter (no false alarms, same count)", () => {
    const r = run("squat", sideFrames([STAND, good, STAND], 5, 900, { jitter: 0.006 }));
    expect(r.summary.reps).toBe(5);
    expect(r.summary.issues).toEqual([]);
  });

  it("asks the user to step into frame instead of guessing", () => {
    const r = run("squat", sideFrames([STAND, good, STAND], 3, 900, { hideFrom: 1000, hideTo: 3500 }));
    expect(r.events.some((e) => e.type === "issue" && e.code === "body_not_visible")).toBe(true);
    expect(r.summary.issues.find((i) => i.code === "body_not_visible")).toBeUndefined(); // setup, not form
  });

  it("ignores tiny movements that aren't reps", () => {
    const r = run("squat", sideFrames([STAND, { shin: 6, thigh: -8, torso: 5, ...ARMS_DOWN }, STAND], 5));
    expect(r.summary.reps).toBe(0);
  });
});

describe("push-up", () => {
  const top: Angles = { shin: 80, thigh: 80, torso: 80, upperArm: 0, forearm: 0 };
  const bottom: Angles = { shin: 86, thigh: 86, torso: 86, upperArm: -60, forearm: 30 };

  it("counts reps with a straight body", () => {
    const r = run("push_up", sideFrames([top, bottom, top], 6));
    expect(r.summary.reps).toBe(6);
    expect(r.summary.issues).toEqual([]);
  });

  it("flags sagging hips as an injury risk and piking as a form issue", () => {
    const sag = run("push_up", sideFrames([{ ...top, torso: 55 }, { ...bottom, torso: 60 }, { ...top, torso: 55 }], 3));
    expect(sag.codes.has("hips_sagging")).toBe(true);
    expect(sag.summary.issues.find((i) => i.code === "hips_sagging")?.severity).toBe("risk");
    const pike = run("push_up", sideFrames([{ ...top, torso: 105 }, { ...bottom, torso: 110 }, { ...top, torso: 105 }], 3));
    expect(pike.codes.has("hips_piking")).toBe(true);
    expect(pike.codes.has("hips_sagging")).toBe(false);
  });

  it("asks for a side view when filmed from the front", () => {
    const a = new FormAnalyzer("push_up");
    a.update({ landmarks: frontPose({ armRaise: 10 }), t: 0, aspect: 1 });
    expect(a.state.setupHint).toMatch(/side-on/);
  });
});

describe("overhead press", () => {
  const rack: Angles = { shin: 0, thigh: 0, torso: 0, upperArm: 0, forearm: 160 };
  const lockout: Angles = { shin: 0, thigh: 0, torso: 0, upperArm: 180, forearm: 180 };

  it("counts locked-out reps", () => {
    const r = run("overhead_press", sideFrames([rack, lockout, rack], 4));
    expect(r.summary.reps).toBe(4);
    expect(r.summary.issues).toEqual([]);
  });

  it("flags leaning back as an injury risk", () => {
    const r = run("overhead_press", sideFrames([{ ...rack, torso: -5 }, { ...lockout, torso: -22 }, { ...rack, torso: -5 }], 3));
    expect(r.summary.issues[0]).toMatchObject({ code: "leaning_back", severity: "risk" });
  });

  it("notes reps that don't reach lockout", () => {
    // Forearm stays vertical; the upper arm stops short of vertical → elbow never straightens.
    const vRack = { ...rack, forearm: 180 };
    const r = run("overhead_press", sideFrames([vRack, { ...lockout, upperArm: 140 }, vRack], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.codes).toEqual(new Set(["no_lockout"]));
  });
});

describe("biceps curl", () => {
  const down: Angles = { ...STAND };
  const up: Angles = { ...STAND, forearm: 150 };
  it("counts strict curls", () => {
    const r = run("biceps_curl", sideFrames([down, up, down], 8, 700));
    expect(r.summary.reps).toBe(8);
    expect(r.summary.issues).toEqual([]);
  });
  it("flags body swing and elbows drifting forward", () => {
    const swing = run("biceps_curl", sideFrames([{ ...down, torso: 8 }, { ...up, torso: -12 }, { ...down, torso: 8 }], 3, 700));
    expect(swing.codes.has("body_swing")).toBe(true);
    const drift = run("biceps_curl", sideFrames([down, { ...up, upperArm: -55 }, down], 3, 700));
    expect(drift.codes.has("elbow_drift")).toBe(true);
  });
});

describe("romanian deadlift (hinge)", () => {
  const bottom: Angles = { shin: 5, thigh: -12, torso: 80, ...ARMS_DOWN };
  it("counts hinge reps", () => {
    const r = run("hinge", sideFrames([STAND, bottom, STAND], 4));
    expect(r.summary.reps).toBe(4);
    expect(r.summary.issues).toEqual([]);
  });
  it("flags squatting the weight down", () => {
    const r = run("hinge", sideFrames([STAND, { shin: 35, thigh: -60, torso: 60, ...ARMS_DOWN }, STAND], 3));
    expect(r.codes.has("squatting_hinge")).toBe(true);
  });
});

describe("lateral raise", () => {
  const rest = { drop: 0, kneeIn: 0, armRaise: 15, tilt: 0 };
  it("counts raises to shoulder height and flags going too high", () => {
    expect(run("lateral_raise", frontFrames([rest, { ...rest, armRaise: 90 }, rest], 5)).summary).toMatchObject({ reps: 5, issues: [] });
    const high = run("lateral_raise", frontFrames([rest, { ...rest, armRaise: 135 }, rest], 3));
    expect(high.codes).toEqual(new Set(["too_high"]));
  });
});

describe("rep counting for upward movements", () => {
  const rest = { drop: 0, kneeIn: 0, armRaise: 15, tilt: 0 };
  it("doesn't count a raise that never reaches the top", () => {
    expect(run("lateral_raise", frontFrames([rest, { ...rest, armRaise: 60 }, rest], 4)).summary.reps).toBe(0);
  });
  it("counts a long hold at the top as one rep", () => {
    const up = { ...rest, armRaise: 90 };
    expect(run("lateral_raise", frontFrames([rest, up, up, up, up, rest], 1)).summary.reps).toBe(1);
  });
});

describe("plank (hold)", () => {
  const plank: Angles = { shin: 85, thigh: 85, torso: 85, upperArm: 0, forearm: 0 };
  it("times the hold and records seconds with sagging hips", () => {
    const frames = sideFrames([plank, plank], 1, 3000).concat(
      sideFrames([{ ...plank, torso: 62 }, { ...plank, torso: 62 }], 1, 2000).map((f) => ({ ...f, t: f.t + 3700 })),
    );
    const r = run("plank", frames);
    expect(r.summary.reps).toBe(0);
    expect(r.summary.durationSeconds).toBeGreaterThanOrEqual(5);
    const sag = r.summary.issues.find((i) => i.code === "hips_sagging");
    expect(sag?.severity).toBe("risk");
    expect(sag!.count).toBeGreaterThanOrEqual(1);
    expect(sag!.count).toBeLessThanOrEqual(3);
  });
});

describe("glute bridge", () => {
  const down: Angles = { shin: -20, thigh: -130, torso: -90, ...ARMS_DOWN };
  const up: Angles = { shin: -20, thigh: -110, torso: -110, ...ARMS_DOWN };
  it("counts full bridges and tips on partial ones", () => {
    expect(run("glute_bridge", sideFrames([down, up, down], 4)).summary).toMatchObject({ reps: 4, issues: [] });
    const partial = run("glute_bridge", sideFrames([down, { ...up, torso: -97 }, down], 3));
    expect(partial.summary.reps).toBe(3);
    expect(partial.codes).toEqual(new Set(["partial_range"]));
  });
});

describe("lunge", () => {
  it("counts lunges and flags torso lean from the side", () => {
    const bottom: Angles = { shin: 20, thigh: -70, torso: 10, ...ARMS_DOWN };
    expect(run("lunge", sideFrames([STAND, bottom, STAND], 4)).summary).toMatchObject({ reps: 4, issues: [] });
    const lean = run("lunge", sideFrames([STAND, { ...bottom, torso: 45 }, STAND], 3));
    expect(lean.codes.has("torso_lean")).toBe(true);
  });
});

describe("row", () => {
  const hang: Angles = { shin: 10, thigh: -10, torso: 55, upperArm: 0, forearm: 0 };
  const pulled: Angles = { ...hang, upperArm: 90, forearm: -10 };
  it("counts full rows with a still torso", () => {
    const r = run("row", sideFrames([hang, pulled, hang], 4));
    expect(r.summary.reps).toBe(4);
    expect(r.summary.issues).toEqual([]);
  });
  it("flags heaving the weight up with the back as an injury risk", () => {
    const r = run("row", sideFrames([hang, { ...pulled, torso: 25 }, hang], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.summary.issues.find((i) => i.code === "torso_swing")).toMatchObject({ severity: "risk", count: 3 });
  });
  it("tips on short pulls", () => {
    const r = run("row", sideFrames([hang, { ...hang, upperArm: 72 }, hang], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.codes.has("partial_range")).toBe(true);
    expect(r.summary.cleanReps).toBe(3);
  });
});

describe("pull-up / pulldown", () => {
  const hang = { drop: 0, kneeIn: 0, armRaise: 165, tilt: 0, elbowBend: 0 };
  const top = { ...hang, armRaise: 95, elbowBend: 100 };
  it("counts even, full pulls", () => {
    const r = run("vertical_pull", frontFrames([hang, top, hang], 4));
    expect(r.summary.reps).toBe(4);
    expect(r.summary.issues).toEqual([]);
  });
  it("flags pulling with one arm more than the other", () => {
    // Every keyframe needs the same keys so they interpolate.
    const h = { ...hang, elbowBendRight: 0 };
    const r = run("vertical_pull", frontFrames([h, { ...top, elbowBendRight: 45 }, h], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.codes.has("uneven_pull")).toBe(true);
    expect(r.summary.cleanReps).toBe(0);
  });
  it("tips on half reps", () => {
    const r = run("vertical_pull", frontFrames([hang, { ...hang, armRaise: 120, elbowBend: 75 }, hang], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.codes.has("partial_range")).toBe(true);
  });
  it("asks the user to face the camera when filmed side-on", () => {
    const r = run("vertical_pull", sideFrames([{ ...STAND, upperArm: 180, forearm: 180 }, { ...STAND, upperArm: 150, forearm: 0 }], 2));
    expect(r.summary.reps).toBe(0);
    expect(r.a.state.setupHint).toMatch(/Face the camera/);
  });
});

describe("triceps pushdown", () => {
  const up: Angles = { shin: 0, thigh: 0, torso: 10, upperArm: 0, forearm: -80 };
  const down: Angles = { ...up, forearm: 0 };
  it("counts locked-out pushdowns", () => {
    const r = run("triceps_pushdown", sideFrames([up, down, up], 4));
    expect(r.summary.reps).toBe(4);
    expect(r.summary.issues).toEqual([]);
  });
  it("flags elbows moving and leaning over the handle", () => {
    const drift = run("triceps_pushdown", sideFrames([{ ...up, upperArm: -50, forearm: -130 }, down, { ...up, upperArm: -50, forearm: -130 }], 3));
    expect(drift.codes.has("elbow_drift")).toBe(true);
    const lean = run("triceps_pushdown", sideFrames([{ ...up, torso: 45 }, { ...down, torso: 45 }, { ...up, torso: 45 }], 3));
    expect(lean.codes.has("torso_lean")).toBe(true);
    expect(lean.codes.has("elbow_drift")).toBe(false);
  });
});

describe("overhead triceps extension", () => {
  const bent: Angles = { ...STAND, upperArm: 180, forearm: 70 };
  const straight: Angles = { ...STAND, upperArm: 180, forearm: 180 };
  it("counts reps with elbows up", () => {
    const r = run("overhead_triceps", sideFrames([bent, straight, bent], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.summary.issues).toEqual([]);
  });
  it("flags arching back as an injury risk and elbows drifting forward", () => {
    const arch = run("overhead_triceps", sideFrames([{ ...bent, torso: -20 }, { ...straight, torso: -20 }, { ...bent, torso: -20 }], 3));
    expect(arch.summary.issues.find((i) => i.code === "leaning_back")?.severity).toBe("risk");
    const drift = run("overhead_triceps", sideFrames([{ ...bent, upperArm: -130, forearm: -40 }, { ...straight, upperArm: -130, forearm: -130 }, { ...bent, upperArm: -130, forearm: -40 }], 3));
    expect(drift.codes.has("elbow_drift")).toBe(true);
  });
});

describe("bench dip", () => {
  const top: Angles = { shin: -70, thigh: -80, torso: 0, upperArm: 20, forearm: 0 };
  const bottom: Angles = { ...top, upperArm: 90, forearm: -15 };
  it("counts dips to about 90°", () => {
    const r = run("bench_dip", sideFrames([top, bottom, top], 4));
    expect(r.summary.reps).toBe(4);
    expect(r.summary.issues).toEqual([]);
  });
  it("warns about dipping too deep as an injury risk", () => {
    const r = run("bench_dip", sideFrames([top, { ...top, upperArm: 90, forearm: -30 }, top], 3));
    expect(r.summary.reps).toBe(3);
    expect(r.summary.issues.find((i) => i.code === "too_deep")).toMatchObject({ severity: "risk", count: 3 });
    expect(r.events.some((e) => e.type === "issue" && e.code === "too_deep")).toBe(true);
  });
});

describe("side plank (hold)", () => {
  const line: Angles = { shin: 72, thigh: 72, torso: 72, upperArm: 0, forearm: -90 };
  it("times a straight hold with no issues", () => {
    const r = run("side_plank", sideFrames([line, line], 3, 1500));
    expect(r.summary.durationSeconds).toBeGreaterThanOrEqual(4);
    expect(r.summary.issues).toEqual([]);
  });
  it("records seconds with the hips dropping", () => {
    const sag: Angles = { ...line, thigh: 88, torso: 58 };
    const r = run("side_plank", sideFrames([sag, sag], 3, 1500));
    expect(r.summary.issues.find((i) => i.code === "hips_sagging")?.count).toBeGreaterThanOrEqual(3);
  });
});

describe("animated form guides", () => {
  it.each(FORM_PROFILES)("the %s demo passes its own form check", (profile) => {
    const g = GUIDES[profile];
    const frames = g.view === "side" ? sideFrames(g.keys, 3) : frontFrames(g.keys, 3);
    const r = run(profile, frames);
    if (FORM_PROFILE_DEFS[profile].mode === "hold") {
      expect(r.summary.durationSeconds).toBeGreaterThan(0);
    } else {
      expect(r.summary.reps).toBe(3);
      expect(r.summary.cleanReps).toBe(3);
    }
    expect(r.summary.issues).toEqual([]);
  });
});

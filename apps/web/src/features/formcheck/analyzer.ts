import { FORM_PROFILE_DEFS, issueDef, type FormCheckResult, type FormProfileId, type IssueSeverity } from "@gymfit/shared";
import { L, SIDE, angle, belowLine, dist, fromVertical, mid, signedLean, type Pt, type Side } from "./geometry";

/**
 * On-device form analysis from 2D pose landmarks.
 *
 * Pipeline per frame: landmarks → features (joint angles, lines) → smoothing
 * → rep state machine → per-frame issues (must persist ≥ 300 ms to count)
 * and per-rep issues (evaluated when a rep completes).
 *
 * The thresholds below are coaching heuristics for a single 2D camera, not
 * clinical measurements. They err toward fewer false alarms.
 */

export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

export interface PoseFrame {
  landmarks: Landmark[];
  /** Timestamp in ms. */
  t: number;
  /** Video width / height, so angles aren't distorted by non-square frames. */
  aspect: number;
}

export type View = "side" | "front" | "unknown";

export type AnalyzerEvent =
  | { type: "rep"; rep: number; issues: string[]; clean: boolean }
  | { type: "issue"; code: string; severity: IssueSeverity; cue: string };

export interface ActiveCue {
  code: string;
  severity: IssueSeverity;
  cue: string;
}

export interface AnalyzerState {
  reps: number;
  cleanReps: number;
  view: View;
  visible: boolean;
  /** Setup guidance (e.g. "Turn side-on") when the camera angle doesn't suit this check. */
  setupHint: string | null;
  cues: ActiveCue[];
  lastRep: { rep: number; issues: string[] } | null;
  /** Hold mode only. */
  holdSeconds: number;
  /** Landmark indices currently involved in an issue (to colour the skeleton). */
  flaggedJoints: number[];
}

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */

interface Features {
  view: View;
  side: Side;
  pts: Pt[];
  kneeAngle: number;
  kneeAngleMin: number;
  hipAngle: number;
  elbowAngle: number;
  torsoFromVertical: number;
  /** Positive = shoulders behind hips (leaning back), side view. */
  leanBack: number;
  /** Signed torso tilt (for swing detection). */
  torsoSigned: number;
  bodyLine: number;
  hipBelowLine: boolean;
  /** Hip height above the lowest ankle, in image heights. */
  hipHeight: number;
  /** How far the knees sit inside the ankles, as a fraction of hip width (front view). */
  kneeInward: number;
  upperArmFromTorso: number;
  abduction: number;
  /** Wrist height above the shoulder, in upper-arm lengths. */
  wristAboveShoulder: number;
}

const VIS = 0.5;

function toPts(f: PoseFrame): Pt[] {
  return f.landmarks.map((l) => ({ x: l.x * f.aspect, y: l.y }));
}

const vis = (f: PoseFrame, i: number) => f.landmarks[i]?.visibility ?? 1;

function sideScore(f: PoseFrame, s: Side): number {
  const j = SIDE[s];
  return [j.shoulder, j.elbow, j.wrist, j.hip, j.knee, j.ankle].reduce((n, i) => n + vis(f, i), 0);
}

function computeFeatures(f: PoseFrame): Features {
  const p = toPts(f);
  const side: Side = sideScore(f, "left") >= sideScore(f, "right") ? "left" : "right";
  const j = SIDE[side];
  const ls = p[L.leftShoulder]!, rs = p[L.rightShoulder]!, lh = p[L.leftHip]!, rh = p[L.rightHip]!;
  const midS = mid(ls, rs), midH = mid(lh, rh);
  const torsoLen = Math.max(dist(midS, midH), 1e-6);
  const shoulderSpread = Math.abs(ls.x - rs.x) / torsoLen;
  const view: View = shoulderSpread > 0.45 ? "front" : shoulderSpread < 0.3 ? "side" : "unknown";

  const S = p[j.shoulder]!, E = p[j.elbow]!, W = p[j.wrist]!, H = p[j.hip]!, K = p[j.knee]!, A = p[j.ankle]!;
  const nose = p[L.nose]!;
  const footDir = Math.sign(p[j.foot]!.x - p[j.heel]!.x);
  const noseDir = Math.sign(nose.x - S.x);
  const facing: 1 | -1 = (vis(f, L.nose) > VIS ? noseDir : footDir) >= 0 ? 1 : -1;

  const kneeL = angle(p[L.leftHip]!, p[L.leftKnee]!, p[L.leftAnkle]!);
  const kneeR = angle(p[L.rightHip]!, p[L.rightKnee]!, p[L.rightAnkle]!);
  const lowestAnkle = Math.max(p[L.leftAnkle]!.y, p[L.rightAnkle]!.y);

  // Front view: knee position relative to the ankle, toward the body's midline.
  const hipW = Math.max(Math.abs(lh.x - rh.x), 1e-6);
  const inward = (knee: Pt, ankle: Pt) => (Math.abs(ankle.x - midH.x) - Math.abs(knee.x - midH.x)) / hipW;
  const kneeInward = Math.max(inward(p[L.leftKnee]!, p[L.leftAnkle]!), inward(p[L.rightKnee]!, p[L.rightAnkle]!));

  const abd = (s: Pt, e: Pt, h: Pt) => angle(h, s, e);
  const torsoTop = view === "front" ? midS : S;
  const torsoBottom = view === "front" ? midH : H;

  return {
    view,
    side,
    pts: p,
    kneeAngle: side === "left" ? kneeL : kneeR,
    kneeAngleMin: Math.min(kneeL, kneeR),
    hipAngle: angle(S, H, K),
    elbowAngle: angle(S, E, W),
    torsoFromVertical: fromVertical(torsoTop, torsoBottom),
    leanBack: -signedLean(S, H, facing),
    torsoSigned: signedLean(torsoTop, torsoBottom, view === "front" ? 1 : facing),
    bodyLine: angle(S, H, A),
    hipBelowLine: belowLine(H, S, A),
    hipHeight: lowestAnkle - midH.y,
    kneeInward,
    upperArmFromTorso: angle(E, S, H),
    abduction: (abd(ls, p[L.leftElbow]!, lh) + abd(rs, p[L.rightElbow]!, rh)) / 2,
    wristAboveShoulder: (S.y - W.y) / Math.max(dist(S, E), 1e-6),
  };
}

/* ------------------------------------------------------------------ */
/* Per-movement rules                                                  */
/* ------------------------------------------------------------------ */

interface RepAcc {
  min: Record<string, number>;
  max: Record<string, number>;
}

interface Ctx {
  /** Standing hip height (running max) for hip-drop based rep counting. */
  standingHip: number;
}

interface Rules {
  /** Landmarks that must be visible. */
  required: readonly number[];
  /** Views in which reps are counted; others show a setup hint. */
  views: readonly View[];
  metric: (f: Features, ctx: Ctx) => number;
  /** "down": rest above `top`, rep = falls below `bottom` and returns. "up": rest below `bottom`, rep = rises above `top` and returns. */
  dir: "down" | "up";
  bottom: number;
  top: number;
  /** Only analyse when true (e.g. body horizontal for push-ups). */
  gate?: (f: Features) => boolean;
  /** Issues checked every frame (must persist to count). */
  frame?: (f: Features, ctx: Ctx, m: number) => string[];
  /** Issues checked once the rep completes, from min/max of tracked features. */
  rep?: (acc: RepAcc, view: View) => string[];
  track?: (keyof Features)[];
  /** Joints to highlight per issue code. */
  joints?: Record<string, number[]>;
}

const LEGS = [L.leftHip, L.rightHip, L.leftKnee, L.rightKnee, L.leftAnkle, L.rightAnkle];
const UPPER = [L.leftShoulder, L.rightShoulder, L.leftElbow, L.rightElbow, L.leftWrist, L.rightWrist, L.leftHip, L.rightHip];
const FULL = [L.leftShoulder, L.rightShoulder, ...LEGS];
const KNEES = [L.leftKnee, L.rightKnee];
const HIPS = [L.leftHip, L.rightHip];
const SHOULDERS = [L.leftShoulder, L.rightShoulder];
const ELBOWS = [L.leftElbow, L.rightElbow];

const hipDrop = (f: Features, ctx: Ctx) => f.hipHeight / Math.max(ctx.standingHip, 1e-6);
const horizontal = (f: Features) => f.torsoFromVertical > 50;

const RULES: Record<FormProfileId, Rules> = {
  squat: {
    required: FULL,
    views: ["side", "front", "unknown"],
    metric: hipDrop,
    dir: "down",
    // A rep = hips drop ≥ 12% of standing height, then return to ≥ 95%.
    bottom: 0.88,
    top: 0.95,
    track: ["kneeAngle", "torsoFromVertical"],
    frame: (f, _c, m) => (f.view === "front" && m < 0.92 && f.kneeInward > 0.35 ? ["knees_caving"] : []),
    rep: (a, view) => [
      ...(view === "side" && a.max.torsoFromVertical! > 60 ? ["torso_lean"] : []),
      ...(view === "side" && a.min.kneeAngle! > 115 ? ["shallow_depth"] : []),
    ],
    joints: { knees_caving: KNEES, torso_lean: [...SHOULDERS, ...HIPS], shallow_depth: KNEES },
  },
  lunge: {
    required: FULL,
    views: ["side", "front", "unknown"],
    metric: hipDrop,
    dir: "down",
    bottom: 0.88,
    top: 0.95,
    track: ["kneeAngleMin", "torsoFromVertical"],
    frame: (f, _c, m) => (f.view === "front" && m < 0.92 && f.kneeInward > 0.35 ? ["knee_caving"] : []),
    rep: (a, view) => [
      ...(view === "side" && a.max.torsoFromVertical! > 30 ? ["torso_lean"] : []),
      ...(view === "side" && a.min.kneeAngleMin! > 110 ? ["shallow_depth"] : []),
    ],
    joints: { knee_caving: KNEES, torso_lean: [...SHOULDERS, ...HIPS], shallow_depth: KNEES },
  },
  push_up: {
    required: FULL,
    views: ["side"],
    metric: (f) => f.elbowAngle,
    dir: "down",
    bottom: 120,
    top: 150,
    gate: horizontal,
    track: ["elbowAngle"],
    frame: (f) => (f.bodyLine < 160 ? [f.hipBelowLine ? "hips_sagging" : "hips_piking"] : []),
    rep: (a) => (a.min.elbowAngle! > 100 ? ["partial_range"] : []),
    joints: { hips_sagging: HIPS, hips_piking: HIPS, partial_range: ELBOWS },
  },
  hinge: {
    required: FULL,
    views: ["side"],
    metric: (f) => f.hipAngle,
    dir: "down",
    bottom: 140,
    top: 160,
    track: ["kneeAngle", "hipAngle"],
    rep: (a) => [...(a.min.kneeAngle! < 125 ? ["squatting_hinge"] : []), ...(a.min.hipAngle! > 125 ? ["partial_range"] : [])],
    joints: { squatting_hinge: KNEES, partial_range: HIPS },
  },
  overhead_press: {
    required: UPPER,
    views: ["side"],
    metric: (f) => f.wristAboveShoulder,
    dir: "up",
    bottom: 0.6,
    top: 1.5,
    track: ["elbowAngle"],
    frame: (f) => (f.leanBack > 12 ? ["leaning_back"] : []),
    rep: (a) => (a.max.elbowAngle! < 155 ? ["no_lockout"] : []),
    joints: { leaning_back: [...SHOULDERS, ...HIPS], no_lockout: ELBOWS },
  },
  biceps_curl: {
    required: UPPER,
    views: ["side"],
    metric: (f) => f.elbowAngle,
    dir: "down",
    bottom: 70,
    top: 140,
    track: ["torsoSigned", "upperArmFromTorso"],
    rep: (a) => [
      ...(a.max.torsoSigned! - a.min.torsoSigned! > 12 ? ["body_swing"] : []),
      ...(a.max.upperArmFromTorso! > 35 ? ["elbow_drift"] : []),
    ],
    joints: { body_swing: [...SHOULDERS, ...HIPS], elbow_drift: ELBOWS },
  },
  lateral_raise: {
    required: UPPER,
    views: ["front"],
    metric: (f) => f.abduction,
    dir: "up",
    bottom: 35,
    top: 70,
    track: ["abduction", "torsoSigned"],
    rep: (a) => [
      ...(a.max.abduction! > 110 ? ["too_high"] : []),
      ...(a.max.abduction! < 80 ? ["partial_range"] : []),
      ...(a.max.torsoSigned! - a.min.torsoSigned! > 10 ? ["body_swing"] : []),
    ],
    joints: { too_high: [...SHOULDERS, ...ELBOWS], partial_range: ELBOWS, body_swing: [...SHOULDERS, ...HIPS] },
  },
  plank: {
    required: FULL,
    views: ["side"],
    metric: (f) => f.bodyLine,
    dir: "down",
    bottom: 0,
    top: 0,
    gate: horizontal,
    frame: (f) => (f.bodyLine < 165 ? [f.hipBelowLine ? "hips_sagging" : "hips_piking"] : []),
    joints: { hips_sagging: HIPS, hips_piking: HIPS },
  },
  glute_bridge: {
    required: [L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip, L.leftKnee, L.rightKnee],
    views: ["side"],
    metric: (f) => f.hipAngle,
    dir: "up",
    bottom: 145,
    top: 160,
    gate: horizontal,
    track: ["hipAngle"],
    rep: (a) => (a.max.hipAngle! < 170 ? ["partial_range"] : []),
    joints: { partial_range: HIPS },
  },
};

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

const PERSIST_MS = 300;
const NOT_VISIBLE_MS = 1000;
const MIN_REP_MS = 400;
const SMOOTH = 0.45;
const SETUP_ISSUE = "body_not_visible";

const VIEW_HINT: Record<"side" | "front", string> = {
  side: "Turn side-on to the camera for this exercise",
  front: "Face the camera for this exercise",
};

export class FormAnalyzer {
  readonly profile: FormProfileId;
  private readonly rules: Rules;
  private readonly mode: "reps" | "hold";
  private ctx: Ctx = { standingHip: 0 };
  private smoothed: Partial<Record<keyof Features, number>> = {};
  private phase: "rest" | "rep" = "rest";
  private repStart = 0;
  private acc: RepAcc = { min: {}, max: {} };
  private repIssues = new Set<string>();
  private pending = new Map<string, number>(); // code -> since (ms)
  private active = new Set<string>();
  private hiddenSince: number | null = null;
  private firstT: number | null = null;
  private lastT: number | null = null;
  private issueCounts = new Map<string, number>();
  private holdMs = 0;
  private holdFlaggedMs = new Map<string, number>();
  private _state: AnalyzerState = {
    reps: 0,
    cleanReps: 0,
    view: "unknown",
    visible: false,
    setupHint: null,
    cues: [],
    lastRep: null,
    holdSeconds: 0,
    flaggedJoints: [],
  };

  constructor(profile: FormProfileId) {
    this.profile = profile;
    this.rules = RULES[profile];
    this.mode = FORM_PROFILE_DEFS[profile].mode;
  }

  get state(): AnalyzerState {
    return this._state;
  }

  private cue(code: string): ActiveCue {
    const d = issueDef(this.profile, code);
    return { code, severity: d?.severity ?? "tip", cue: d?.cue ?? code };
  }

  private smooth(f: Features): Features {
    const out = { ...f };
    for (const k of Object.keys(f) as (keyof Features)[]) {
      const v = f[k];
      if (typeof v !== "number") continue;
      const prev = this.smoothed[k];
      const s = prev === undefined ? v : prev + SMOOTH * (v - prev);
      this.smoothed[k] = s;
      (out as Record<string, unknown>)[k] = s;
    }
    return out;
  }

  /** Feed one frame. Returns events (rep completed, new issue) for this frame. */
  update(frame: PoseFrame): AnalyzerEvent[] {
    const events: AnalyzerEvent[] = [];
    const t = frame.t;
    const dt = this.lastT === null ? 0 : Math.min(t - this.lastT, 250);
    this.lastT = t;

    const visible = frame.landmarks.length >= 33 && this.rules.required.every((i) => vis(frame, i) >= VIS);
    if (!visible) {
      this.hiddenSince ??= t;
      if (t - this.hiddenSince >= NOT_VISIBLE_MS && !this.active.has(SETUP_ISSUE)) {
        this.active.add(SETUP_ISSUE);
        const c = this.cue(SETUP_ISSUE);
        events.push({ type: "issue", ...c });
      }
      this.publish(false, this._state.view, null);
      return events;
    }
    this.hiddenSince = null;
    this.active.delete(SETUP_ISSUE);
    this.firstT ??= t;

    const f = this.smooth(computeFeatures(frame));
    const view = f.view;
    const wantView = FORM_PROFILE_DEFS[this.profile].view;
    const viewOk = this.rules.views.includes(view);
    const hint = viewOk ? null : wantView === "side_or_front" ? null : VIEW_HINT[wantView];
    if (!viewOk || (this.rules.gate && !this.rules.gate(f))) {
      this.clearContinuous();
      this.publish(true, view, hint);
      return events;
    }

    if (f.hipHeight > this.ctx.standingHip) this.ctx.standingHip = f.hipHeight;
    const m = this.rules.metric(f, this.ctx);

    // Per-frame issues with persistence.
    const now = new Set(this.rules.frame?.(f, this.ctx, m) ?? []);
    for (const code of [...this.pending.keys()]) if (!now.has(code)) this.pending.delete(code);
    for (const code of [...this.active]) if (code !== SETUP_ISSUE && !now.has(code)) this.active.delete(code);
    for (const code of now) {
      const since = this.pending.get(code) ?? t;
      this.pending.set(code, since);
      if (t - since >= PERSIST_MS && !this.active.has(code)) {
        this.active.add(code);
        if (this.mode === "hold" || !this.repIssues.has(code)) events.push({ type: "issue", ...this.cue(code) });
        this.repIssues.add(code);
      }
    }

    if (this.mode === "hold") {
      this.holdMs += dt;
      for (const code of this.active) if (code !== SETUP_ISSUE) this.holdFlaggedMs.set(code, (this.holdFlaggedMs.get(code) ?? 0) + dt);
      this.publish(true, view, hint);
      return events;
    }

    // Rep state machine.
    // "down" movements rest high (above `top`) and peak low (below `bottom`);
    // "up" movements rest low (below `bottom`) and peak high (above `top`).
    const { dir, bottom, top } = this.rules;
    const leftRest = dir === "down" ? m < top : m > bottom;
    const reachedPeak = dir === "down" ? m <= bottom : m >= top;
    const backAtRest = dir === "down" ? m >= top : m <= bottom;

    if (this.phase === "rest") {
      if (leftRest) {
        this.phase = "rep";
        this.repStart = t;
        this.acc = { min: {}, max: {} };
        this.reached = false;
        this.repIssues = new Set([...this.active].filter((c) => c !== SETUP_ISSUE));
      }
    }
    if (this.phase === "rep") {
      for (const k of this.rules.track ?? []) {
        const v = f[k] as number;
        this.acc.min[k] = Math.min(this.acc.min[k] ?? Infinity, v);
        this.acc.max[k] = Math.max(this.acc.max[k] ?? -Infinity, v);
      }
      if (reachedPeak) this.reached = true;
      if (backAtRest) {
        if (this.reached && t - this.repStart >= MIN_REP_MS) events.push(...this.finishRep(view));
        this.phase = "rest";
      }
    }
    this.publish(true, view, hint);
    return events;
  }

  private reached = false;

  private finishRep(view: View): AnalyzerEvent[] {
    const events: AnalyzerEvent[] = [];
    for (const code of this.rules.rep?.(this.acc, view) ?? []) {
      if (!this.repIssues.has(code)) events.push({ type: "issue", ...this.cue(code) });
      this.repIssues.add(code);
    }
    const issues = [...this.repIssues].filter((c) => c !== SETUP_ISSUE);
    for (const code of issues) this.issueCounts.set(code, (this.issueCounts.get(code) ?? 0) + 1);
    const clean = !issues.some((c) => this.cue(c).severity !== "tip");
    const reps = this._state.reps + 1;
    this._state = { ...this._state, reps, cleanReps: this._state.cleanReps + (clean ? 1 : 0), lastRep: { rep: reps, issues } };
    events.unshift({ type: "rep", rep: reps, issues, clean });
    this.repIssues = new Set();
    return events;
  }

  private clearContinuous() {
    this.pending.clear();
    for (const c of [...this.active]) if (c !== SETUP_ISSUE) this.active.delete(c);
  }

  private publish(visible: boolean, view: View, setupHint: string | null) {
    const joints = new Set<number>();
    for (const code of this.active) for (const j of this.rules.joints?.[code] ?? []) joints.add(j);
    // Rep-level issues from the last rep stay highlighted briefly via lastRep.
    this._state = {
      ...this._state,
      visible,
      view,
      setupHint,
      cues: [...this.active].map((c) => this.cue(c)),
      holdSeconds: Math.round(this.holdMs / 100) / 10,
      flaggedJoints: [...joints],
    };
  }

  /** Metrics to save (no video, no landmarks). */
  summary(): Omit<FormCheckResult, "sessionExerciseId"> {
    const durationSeconds = this.firstT === null || this.lastT === null ? 0 : Math.round((this.lastT - this.firstT) / 1000);
    const counts = this.mode === "hold"
      ? [...this.holdFlaggedMs].map(([code, ms]) => [code, Math.max(1, Math.round(ms / 1000))] as const).filter(([, s]) => s >= 1)
      : [...this.issueCounts];
    return {
      profile: this.profile,
      reps: this.mode === "hold" ? 0 : this._state.reps,
      cleanReps: this.mode === "hold" ? 0 : this._state.cleanReps,
      durationSeconds: this.mode === "hold" ? Math.round(this.holdMs / 1000) : durationSeconds,
      issues: counts
        .map(([code, count]) => ({ code, severity: this.cue(code).severity, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }
}

export const FORM_RULES_FOR_TESTS = RULES;

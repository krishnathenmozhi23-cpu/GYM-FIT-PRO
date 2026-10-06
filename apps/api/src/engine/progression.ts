import type { AdaptationChange, Exercise } from "@gymfit/shared";

/**
 * Adaptive progression (double progression):
 *  1. Work within the rep range at a fixed load.
 *  2. When every prescribed set reaches the top of the range and the
 *     session wasn't rated "too hard", increase load by the smallest
 *     practical increment (never more than ~10%; if the smallest increment
 *     is a bigger jump, add reps instead).
 *  3. One bad session → hold. Two in a row below the range → reduce ~10%.
 * Bodyweight/band and timed exercises progress by reps/seconds.
 */

export interface Prescription {
  sets: number;
  repsMin: number;
  repsMax: number;
  durationSeconds: number | null;
  targetWeightKg: number | null;
}

export interface Performance {
  /** Session rating 1 (very easy) … 5 (too hard). */
  difficultyRating: number | null;
  status: "completed" | "skipped" | "pending";
  sets: { reps: number | null; weightKg: number | null; durationSeconds: number | null }[];
  /** What was prescribed for that session. */
  target: Prescription;
}

export interface ProgressionResult {
  next: Prescription;
  change: Omit<AdaptationChange, "exerciseId" | "exerciseName"> | null;
}

const MAX_RELATIVE_INCREASE = 0.1;
const REDUCTION = 0.1;
const REP_CAP = 25;
const TIME_STEP = 5;
const TIME_CAP = 120;

export function loadIncrement(ex: Pick<Exercise, "equipment">): number {
  if (ex.equipment.includes("barbell")) return 2.5;
  if (ex.equipment.includes("kettlebell")) return 4;
  if (ex.equipment.includes("machine") || ex.equipment.includes("cable")) return 2.5;
  return 2; // dumbbells
}

function roundTo(value: number, step: number, mode: "down" | "nearest" = "nearest"): number {
  const n = value / step;
  return Math.max(0, (mode === "down" ? Math.floor(n) : Math.round(n)) * step);
}

const fmtKg = (kg: number | null) => (kg === null ? "—" : `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`);
const fmtReps = (p: Prescription) => (p.repsMin === p.repsMax ? `${p.repsMin}` : `${p.repsMin}–${p.repsMax}`);

/** Did the session fall below the rep range on at least half the prescribed sets (or rate 5/5)? */
function struggled(perf: Performance, ex: Pick<Exercise, "measure">): boolean {
  if (perf.status === "skipped" || perf.sets.length === 0) return false;
  const short =
    ex.measure === "time"
      ? perf.sets.filter((s) => (s.durationSeconds ?? 0) < (perf.target.durationSeconds ?? 0) * 0.8).length
      : perf.sets.filter((s) => (s.reps ?? 0) < perf.target.repsMin).length;
  const missingSets = Math.max(0, perf.target.sets - perf.sets.length);
  return short + missingSets >= Math.ceil(perf.target.sets / 2) || perf.difficultyRating === 5;
}

function hitTop(perf: Performance, ex: Pick<Exercise, "measure">): boolean {
  if (perf.sets.length < perf.target.sets) return false;
  if (ex.measure === "time") return perf.sets.every((s) => (s.durationSeconds ?? 0) >= (perf.target.durationSeconds ?? 0));
  return perf.sets.every((s) => (s.reps ?? 0) >= perf.target.repsMax);
}

/**
 * `history` is newest first. Returns the next prescription for this
 * exercise plus a human-readable change (null when nothing changed).
 */
export function progress(
  ex: Pick<Exercise, "measure" | "loaded" | "equipment">,
  current: Prescription,
  history: Performance[],
): ProgressionResult {
  const last = history[0];
  if (!last || last.status === "skipped" || last.sets.length === 0) return { next: current, change: null };
  const prev = history[1];
  const tooHard = last.difficultyRating !== null && last.difficultyRating >= 5;

  // --- Timed exercises: progress seconds ---
  if (ex.measure === "time" && current.durationSeconds !== null) {
    if (struggled(last, ex) && prev && struggled(prev, ex)) {
      const d = Math.max(10, current.durationSeconds - TIME_STEP);
      if (d === current.durationSeconds) return { next: current, change: null };
      return {
        next: { ...current, durationSeconds: d },
        change: { kind: "reduce_load", from: `${current.durationSeconds}s`, to: `${d}s`, reason: "Two sessions in a row short of the target time." },
      };
    }
    if (hitTop(last, ex) && !tooHard && current.durationSeconds < TIME_CAP) {
      const d = Math.min(TIME_CAP, current.durationSeconds + TIME_STEP);
      return {
        next: { ...current, durationSeconds: d },
        change: { kind: "increase_reps", from: `${current.durationSeconds}s`, to: `${d}s`, reason: "You held every set for the full time." },
      };
    }
    return { next: current, change: null };
  }

  // --- Unloaded (bodyweight / band) exercises: progress reps ---
  if (!ex.loaded) {
    if (struggled(last, ex) && prev && struggled(prev, ex) && current.repsMin > 3) {
      const next = { ...current, repsMin: Math.max(3, current.repsMin - 2), repsMax: Math.max(5, current.repsMax - 2) };
      return { next, change: { kind: "reduce_load", from: fmtReps(current), to: fmtReps(next), reason: "Two sessions in a row below the rep range — easing the target." } };
    }
    if (hitTop(last, ex) && !tooHard) {
      if (current.repsMax >= REP_CAP) {
        return { next: current, change: { kind: "maintain", from: fmtReps(current), to: fmtReps(current), reason: "You've mastered this rep range — consider a harder variation from the alternatives." } };
      }
      const next = { ...current, repsMin: Math.min(REP_CAP - 2, current.repsMin + 2), repsMax: Math.min(REP_CAP, current.repsMax + 2) };
      return { next, change: { kind: "increase_reps", from: fmtReps(current), to: fmtReps(next), reason: "You hit the top of the range on every set." } };
    }
    return { next: current, change: null };
  }

  // --- Loaded exercises ---
  const working = Math.max(0, ...last.sets.map((s) => s.weightKg ?? 0));
  const inc = loadIncrement(ex);

  // First calibration: adopt the weight the user actually chose.
  if (current.targetWeightKg === null) {
    if (working <= 0) return { next: current, change: null };
    const next = { ...current, targetWeightKg: working };
    return { next, change: { kind: "maintain", from: "—", to: fmtKg(working), reason: "Calibrated from your first session." } };
  }

  if (struggled(last, ex)) {
    if (prev && struggled(prev, ex)) {
      const reduced = roundTo(current.targetWeightKg * (1 - REDUCTION), inc, "down");
      const target = Math.min(reduced, Math.max(0, current.targetWeightKg - inc));
      const next = { ...current, targetWeightKg: target };
      return {
        next,
        change: { kind: "reduce_load", from: fmtKg(current.targetWeightKg), to: fmtKg(target), reason: "Two sessions in a row below the target reps — a lighter load will help you rebuild momentum." },
      };
    }
    return { next: current, change: { kind: "maintain", from: fmtKg(current.targetWeightKg), to: fmtKg(current.targetWeightKg), reason: "Tough session — keeping the same load. One hard day isn't a trend." } };
  }

  // Used a heavier load than prescribed and still hit the range: adopt it (no further jump this time).
  if (working > current.targetWeightKg && last.sets.every((s) => (s.reps ?? 0) >= current.repsMin)) {
    const next = { ...current, targetWeightKg: working };
    return { next, change: { kind: "increase_load", from: fmtKg(current.targetWeightKg), to: fmtKg(working), reason: "You handled a heavier load than planned within the rep range." } };
  }

  if (hitTop(last, ex) && !tooHard && working >= current.targetWeightKg) {
    const base = current.targetWeightKg;
    if (base > 0 && inc / base > MAX_RELATIVE_INCREASE && current.repsMax < 20) {
      // The smallest plate/dumbbell jump is too big a % — build reps first.
      const next = { ...current, repsMax: Math.min(20, current.repsMax + 2) };
      return { next, change: { kind: "increase_reps", from: fmtReps(current), to: fmtReps(next), reason: `The next weight step (+${inc} kg) is a big jump at this load — add reps first.` } };
    }
    const target = roundTo(base + inc, inc / 2);
    const next = { ...current, targetWeightKg: target };
    return { next, change: { kind: "increase_load", from: fmtKg(base), to: fmtKg(target), reason: "You completed every set at the top of the rep range." } };
  }

  return { next: current, change: null };
}

/**
 * Session-level volume adjustment from recent difficulty ratings (newest
 * first): two "too hard" sessions → one fewer set on accessory work; three
 * "easy" sessions with full completion → one more set on the main lift.
 */
export function volumeAdjustment(recentRatings: (number | null)[]): -1 | 0 | 1 {
  const r = recentRatings.filter((x): x is number => x !== null);
  if (r.length >= 2 && r[0]! >= 5 && r[1]! >= 5) return -1;
  if (r.length >= 3 && r.slice(0, 3).every((x) => x <= 2)) return 1;
  return 0;
}

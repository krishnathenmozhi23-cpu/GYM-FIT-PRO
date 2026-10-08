/**
 * Why an exercise has no camera form check, so the app says so plainly
 * instead of implying it's coming or quietly hiding the button.
 */
const BENCH = "you're lying on a bench, and the bench and weights hide your arms and shoulders from a single camera.";
const MACHINE = "the machine hides too much of your body from the camera to judge form reliably.";
const DEPTH = "the main form errors happen toward or away from the camera, which 2D tracking can't measure reliably.";
const CARRY = "you walk out of the camera's view during a carry.";
const CONDITIONING = "camera checks focus on strength exercises for now; this one isn't built yet.";

const REASONS: Record<string, string> = {
  "barbell-bench-press": BENCH,
  "incline-barbell-bench-press": BENCH,
  "dumbbell-bench-press": BENCH,
  "incline-dumbbell-press": BENCH,
  "close-grip-bench-press": BENCH,
  "dumbbell-fly": BENCH,
  "dumbbell-skull-crusher": BENCH,
  "machine-chest-press": MACHINE,
  "machine-shoulder-press": MACHINE,
  "chest-supported-machine-row": MACHINE,
  "leg-press": MACHINE,
  "leg-extension": MACHINE,
  "lying-leg-curl": MACHINE,
  "machine-calf-raise": MACHINE,
  "cable-chest-fly": DEPTH,
  "band-chest-press": DEPTH,
  "face-pull": DEPTH,
  "band-pull-apart": DEPTH,
  "reverse-dumbbell-fly": DEPTH,
  "band-pallof-press": DEPTH,
  "cable-pallof-press": DEPTH,
  "conventional-deadlift": "knees are meant to bend at the start of a deadlift and back position can't be judged reliably from one camera, so a check would mislead.",
  "farmers-carry": CARRY,
  "suitcase-carry": CARRY,
  "stationary-bike": CONDITIONING,
  "rowing-machine": CONDITIONING,
  "treadmill-run": CONDITIONING,
  "incline-treadmill-walk": CONDITIONING,
  "jumping-jacks": CONDITIONING,
  "step-jacks": CONDITIONING,
  "high-knees": CONDITIONING,
  burpee: CONDITIONING,
  "mountain-climber": CONDITIONING,
  "shadow-boxing": CONDITIONING,
};

export function cameraUnsupportedReason(exerciseId: string): string {
  return REASONS[exerciseId] ?? "this one isn't built yet. Use the demonstration above and the written cues.";
}

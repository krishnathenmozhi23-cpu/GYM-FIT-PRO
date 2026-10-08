import { z } from "zod";

/**
 * Camera form-check catalog: which exercises can be checked, how the
 * camera should be placed, and every issue the analyzer can report.
 * Detection logic lives in the web client (it runs on-device); this file
 * is the shared vocabulary the API, AI coach and UI all use.
 */

export const FORM_PROFILES = [
  "squat",
  "lunge",
  "push_up",
  "hinge",
  "overhead_press",
  "biceps_curl",
  "lateral_raise",
  "plank",
  "glute_bridge",
  "row",
  "vertical_pull",
  "triceps_pushdown",
  "overhead_triceps",
  "bench_dip",
  "side_plank",
] as const;
export type FormProfileId = (typeof FORM_PROFILES)[number];

/** `risk` = may raise injury risk (red, spoken). `form` = less effective (amber). `tip` = optional improvement. */
export type IssueSeverity = "risk" | "form" | "tip";

export interface FormIssueDef {
  code: string;
  /** Short name for summaries, e.g. "Hips sagging". */
  label: string;
  severity: IssueSeverity;
  /** Short cue shown/spoken during the set. */
  cue: string;
  /** Why it matters, shown in the summary. */
  why: string;
}

export interface FormProfile {
  id: FormProfileId;
  name: string;
  /** Best camera angle. Some checks only run from the matching view. */
  view: "side" | "front" | "side_or_front";
  setup: string;
  /** Hold exercises (plank) are timed instead of counting reps. */
  mode: "reps" | "hold";
  issues: FormIssueDef[];
  /** What a single camera can't judge reliably for this movement. */
  limits: string[];
}

const NOT_VISIBLE: FormIssueDef = {
  code: "body_not_visible",
  label: "Body not fully visible",
  severity: "tip",
  cue: "Step back so your whole body is in frame",
  why: "The form check needs to see your shoulders, hips, knees and ankles.",
};

export const FORM_PROFILE_DEFS: Record<FormProfileId, FormProfile> = {
  squat: {
    id: "squat",
    name: "Squat",
    view: "side_or_front",
    setup: "Place the camera about 2–3 m away at hip height. Side-on checks depth and chest position; facing the camera checks knee tracking.",
    mode: "reps",
    issues: [
      { code: "knees_caving", label: "Knees caving in", severity: "risk", cue: "Push your knees out over your toes", why: "Knees collapsing inward under load can stress the knee ligaments." },
      { code: "torso_lean", label: "Leaning too far forward", severity: "form", cue: "Keep your chest up", why: "Leaning far forward shifts load onto the lower back." },
      { code: "shallow_depth", label: "Shallow depth", severity: "tip", cue: "Sit a little deeper if it's comfortable", why: "A fuller range trains more muscle — only go as deep as you can control without pain." },
      NOT_VISIBLE,
    ],
    limits: ["Lower-back rounding can't be measured reliably from one camera.", "Heel lift is hard to see — keep your whole foot planted."],
  },
  lunge: {
    id: "lunge",
    name: "Lunge / split squat",
    view: "side_or_front",
    setup: "Camera 2–3 m away at hip height. Side-on checks your torso; facing the camera checks front-knee tracking.",
    mode: "reps",
    issues: [
      { code: "knee_caving", label: "Front knee caving in", severity: "risk", cue: "Keep your front knee in line with your toes", why: "The knee falling inward can strain the knee." },
      { code: "torso_lean", label: "Leaning too far forward", severity: "form", cue: "Stay tall through your torso", why: "Excessive forward lean reduces leg work and loads the back." },
      { code: "shallow_depth", label: "Shallow depth", severity: "tip", cue: "Lower a bit further if comfortable", why: "Fuller range trains more muscle." },
      NOT_VISIBLE,
    ],
    limits: ["Balance and hip rotation are hard to judge from one camera."],
  },
  push_up: {
    id: "push_up",
    name: "Push-up",
    view: "side",
    setup: "Place the camera side-on at floor level, 2 m away, so your head to heels is visible.",
    mode: "reps",
    issues: [
      { code: "hips_sagging", label: "Hips sagging", severity: "risk", cue: "Hips sagging — squeeze glutes and brace your core", why: "A sagging midsection puts strain on the lower back." },
      { code: "hips_piking", label: "Hips too high", severity: "form", cue: "Lower your hips into a straight line", why: "Piking shifts work away from the chest and core." },
      { code: "partial_range", label: "Partial range of motion", severity: "tip", cue: "Lower your chest further", why: "Partial reps train less of the movement." },
      NOT_VISIBLE,
    ],
    limits: ["Elbow flare is hard to judge from the side."],
  },
  hinge: {
    id: "hinge",
    name: "Hip hinge (RDL, swing, pull-through)",
    view: "side",
    setup: "Camera side-on, 2–3 m away at hip height, whole body in frame.",
    mode: "reps",
    issues: [
      { code: "squatting_hinge", label: "Squatting instead of hinging", severity: "form", cue: "Push your hips back — keep knees soft, not deeply bent", why: "Bending the knees a lot turns the hinge into a squat and reduces hamstring work." },
      { code: "partial_range", label: "Partial range of motion", severity: "tip", cue: "Hinge a little further while keeping your back flat", why: "Fuller range works the hamstrings and glutes more." },
      NOT_VISIBLE,
    ],
    limits: ["Back rounding — the main injury risk when hinging — cannot be measured reliably from one camera. Keep your back flat and use a mirror or coach.", "Conventional deadlifts aren't camera-checked: knees are legitimately bent at the floor and back position can't be judged reliably."],
  },
  overhead_press: {
    id: "overhead_press",
    name: "Overhead press",
    view: "side",
    setup: "Camera side-on, 2–3 m away, from your knees to above your hands.",
    mode: "reps",
    issues: [
      { code: "leaning_back", label: "Leaning back", severity: "risk", cue: "Don't lean back — squeeze glutes and brace", why: "Arching back to press overloads the lower back." },
      { code: "no_lockout", label: "No lockout", severity: "tip", cue: "Press all the way up", why: "Finishing each rep works the full range." },
      NOT_VISIBLE,
    ],
    limits: [],
  },
  biceps_curl: {
    id: "biceps_curl",
    name: "Biceps curl",
    view: "side",
    setup: "Camera side-on, 2 m away, upper body and hips in frame.",
    mode: "reps",
    issues: [
      { code: "body_swing", label: "Swinging the body", severity: "form", cue: "Don't swing your body", why: "Swinging uses momentum and can strain the lower back." },
      { code: "elbow_drift", label: "Elbows drifting forward", severity: "tip", cue: "Keep your elbows by your sides", why: "Moving the upper arm shifts work to the shoulders." },
      NOT_VISIBLE,
    ],
    limits: [],
  },
  lateral_raise: {
    id: "lateral_raise",
    name: "Lateral raise",
    view: "front",
    setup: "Face the camera, 2–3 m away, upper body and hips in frame.",
    mode: "reps",
    issues: [
      { code: "too_high", label: "Raising above shoulder height", severity: "form", cue: "Stop at shoulder height", why: "Raising well above shoulder height with a shrug can irritate the shoulder." },
      { code: "body_swing", label: "Swinging the body", severity: "form", cue: "Keep your torso still", why: "Swinging uses momentum instead of the shoulders." },
      { code: "partial_range", label: "Partial range of motion", severity: "tip", cue: "Raise to shoulder height", why: "Full range works the side delts more." },
      NOT_VISIBLE,
    ],
    limits: [],
  },
  plank: {
    id: "plank",
    name: "Plank",
    view: "side",
    setup: "Camera side-on at floor level, 2 m away, head to heels visible.",
    mode: "hold",
    issues: [
      { code: "hips_sagging", label: "Hips sagging", severity: "risk", cue: "Hips sagging — brace your abs and squeeze glutes", why: "Sagging strains the lower back." },
      { code: "hips_piking", label: "Hips too high", severity: "form", cue: "Lower your hips into a straight line", why: "Piking makes the plank easier and less effective." },
      NOT_VISIBLE,
    ],
    limits: [],
  },
  glute_bridge: {
    id: "glute_bridge",
    name: "Glute bridge / hip thrust",
    view: "side",
    setup: "Camera side-on at floor level, 2 m away.",
    mode: "reps",
    issues: [
      { code: "partial_range", label: "Partial range of motion", severity: "tip", cue: "Lift until shoulders, hips and knees line up", why: "Full hip extension works the glutes most." },
      NOT_VISIBLE,
    ],
    limits: ["Lower-back over-arching at the top can't be told apart from good extension reliably — squeeze your glutes rather than arching."],
  },
  row: {
    id: "row",
    name: "Row",
    view: "side",
    setup: "Camera side-on, 2–3 m away at hip height, so your head, hands and hips stay in frame. For one-arm rows, keep the working arm nearest the camera.",
    mode: "reps",
    issues: [
      { code: "torso_swing", label: "Heaving with your back", severity: "risk", cue: "Keep your back angle still — don't heave the weight", why: "Jerking the torso to move the weight shifts load onto the lower back." },
      { code: "partial_range", label: "Short pull", severity: "tip", cue: "Pull your elbow back past your body", why: "A full pull works the upper back more." },
      NOT_VISIBLE,
    ],
    limits: ["Back rounding can't be measured reliably from one camera — keep your back flat.", "Shoulder-blade squeeze isn't visible to the camera."],
  },
  vertical_pull: {
    id: "vertical_pull",
    name: "Pull-up / pulldown",
    view: "front",
    setup: "Face the camera (or turn your back to it), 2–3 m away, with your hands and hips in frame.",
    mode: "reps",
    issues: [
      { code: "uneven_pull", label: "Pulling unevenly", severity: "form", cue: "Pull evenly with both arms", why: "One arm doing more of the work can overload that shoulder and elbow." },
      { code: "partial_range", label: "Partial range of motion", severity: "tip", cue: "Pull until your elbows reach your sides", why: "A full pull trains the back through its whole range." },
      NOT_VISIBLE,
    ],
    limits: ["Swinging or kipping forward and back can't be seen from the front.", "Leaning far back on pulldowns can't be seen from the front."],
  },
  triceps_pushdown: {
    id: "triceps_pushdown",
    name: "Triceps pushdown",
    view: "side",
    setup: "Camera side-on, 2 m away, upper body and hips in frame.",
    mode: "reps",
    issues: [
      { code: "elbow_drift", label: "Elbows moving", severity: "form", cue: "Pin your elbows to your sides", why: "Moving the upper arm turns it into a shoulder movement and takes work off the triceps." },
      { code: "torso_lean", label: "Leaning over the handle", severity: "form", cue: "Stand tall — don't lean over the handle", why: "Leaning over lets bodyweight push the handle instead of your triceps." },
      { code: "no_lockout", label: "Arms not straightened", severity: "tip", cue: "Straighten your arms fully at the bottom", why: "Full extension works the triceps through their whole range." },
      NOT_VISIBLE,
    ],
    limits: [],
  },
  overhead_triceps: {
    id: "overhead_triceps",
    name: "Overhead triceps extension",
    view: "side",
    setup: "Camera side-on, 2 m away, from your hips to above your hands.",
    mode: "reps",
    issues: [
      { code: "leaning_back", label: "Arching your back", severity: "risk", cue: "Brace your abs — don't arch your lower back", why: "Arching under a weight held overhead loads the lower back." },
      { code: "elbow_drift", label: "Elbows drifting forward", severity: "form", cue: "Keep your elbows pointing up, close to your head", why: "Letting the elbows drift forward shifts work to the shoulders." },
      { code: "no_lockout", label: "Arms not straightened", severity: "tip", cue: "Straighten your arms fully at the top", why: "Full extension works the triceps through their whole range." },
      NOT_VISIBLE,
    ],
    limits: ["Elbows flaring out to the sides can't be seen from the side."],
  },
  bench_dip: {
    id: "bench_dip",
    name: "Bench dip",
    view: "side",
    setup: "Camera side-on at bench height, 2 m away, so your shoulders, elbows and hips are visible.",
    mode: "reps",
    issues: [
      { code: "too_deep", label: "Dipping too deep", severity: "risk", cue: "Stop when your upper arms are level with the floor", why: "Dipping far below that stretches the front of the shoulder hard, a common source of shoulder pain." },
      { code: "partial_range", label: "Partial range of motion", severity: "tip", cue: "Lower until your elbows are bent to about 90°", why: "A fuller range works the triceps more." },
      NOT_VISIBLE,
    ],
    limits: ["Shoulders rolling forward can't be measured reliably from one camera."],
  },
  side_plank: {
    id: "side_plank",
    name: "Side plank",
    view: "side",
    setup: "Face the camera from 2 m away at floor level, so your head to feet is visible.",
    mode: "hold",
    issues: [
      { code: "hips_sagging", label: "Hips dropping", severity: "form", cue: "Lift your hips — keep a straight line", why: "Letting the hips drop takes the work off your obliques and hangs on the shoulder." },
      { code: "hips_piking", label: "Hips too high", severity: "tip", cue: "Lower your hips into a straight line", why: "Piking makes the hold easier and less effective." },
      NOT_VISIBLE,
    ],
    limits: [],
  },
};

/** Which exercises in the library support the camera form check. */
export const EXERCISE_FORM_PROFILE: Record<string, FormProfileId> = {
  "bodyweight-squat": "squat",
  "goblet-squat": "squat",
  "barbell-back-squat": "squat",
  "front-squat": "squat",
  "box-squat": "squat",
  "band-squat": "squat",
  "bodyweight-reverse-lunge": "lunge",
  "dumbbell-reverse-lunge": "lunge",
  "bulgarian-split-squat": "lunge",
  "walking-lunge": "lunge",
  "push-up": "push_up",
  "incline-push-up": "push_up",
  "diamond-push-up": "push_up",
  "romanian-deadlift": "hinge",
  "dumbbell-romanian-deadlift": "hinge",
  "band-good-morning": "hinge",
  "overhead-press": "overhead_press",
  "seated-dumbbell-shoulder-press": "overhead_press",
  "band-overhead-press": "overhead_press",
  "dumbbell-biceps-curl": "biceps_curl",
  "hammer-curl": "biceps_curl",
  "barbell-curl": "biceps_curl",
  "band-curl": "biceps_curl",
  "dumbbell-lateral-raise": "lateral_raise",
  "band-lateral-raise": "lateral_raise",
  plank: "plank",
  "glute-bridge": "glute_bridge",
  "single-leg-glute-bridge": "glute_bridge",
  "dumbbell-hip-thrust": "glute_bridge",
  "barbell-hip-thrust": "glute_bridge",
  "cable-pull-through": "hinge",
  "kettlebell-swing": "hinge",
  "cable-curl": "biceps_curl",
  "barbell-row": "row",
  "one-arm-dumbbell-row": "row",
  "seated-cable-row": "row",
  "band-row": "row",
  "pull-up": "vertical_pull",
  "chin-up": "vertical_pull",
  "assisted-pull-up": "vertical_pull",
  "lat-pulldown": "vertical_pull",
  "band-lat-pulldown": "vertical_pull",
  "triceps-pushdown": "triceps_pushdown",
  "band-triceps-pushdown": "triceps_pushdown",
  "overhead-dumbbell-triceps-extension": "overhead_triceps",
  "bench-dip": "bench_dip",
  "side-plank": "side_plank",
};

export function formProfileFor(exerciseId: string): FormProfile | null {
  const id = EXERCISE_FORM_PROFILE[exerciseId];
  return id ? FORM_PROFILE_DEFS[id] : null;
}

export function issueDef(profile: FormProfileId, code: string): FormIssueDef | undefined {
  return FORM_PROFILE_DEFS[profile].issues.find((i) => i.code === code);
}

/* ---------- Saved results (metrics only — video never leaves the device) ---------- */

export const formCheckResultSchema = z.object({
  sessionExerciseId: z.uuid(),
  profile: z.enum(FORM_PROFILES),
  /** Reps counted by the camera (0 for holds). */
  reps: z.number().int().min(0).max(200),
  /** Reps with no `risk` or `form` issue. */
  cleanReps: z.number().int().min(0).max(200),
  /** Seconds the camera was tracking (hold time for planks). */
  durationSeconds: z.number().int().min(0).max(3600),
  issues: z
    .array(
      z.object({
        code: z.string().min(1).max(40),
        severity: z.enum(["risk", "form", "tip"]),
        /** Reps (or seconds, for holds) in which it occurred. */
        count: z.number().int().min(1).max(3600),
      }),
    )
    .max(10),
});
export type FormCheckResult = z.infer<typeof formCheckResultSchema>;

export interface FormCheckView extends Omit<FormCheckResult, "sessionExerciseId"> {
  id: string;
  createdAt: string;
}

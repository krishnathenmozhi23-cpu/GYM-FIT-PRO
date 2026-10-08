/**
 * Demonstration photos (start and end position) for each exercise, from the
 * public-domain Free Exercise DB (github.com/yuhonas/free-exercise-db,
 * Unlicense). Files live in /public/demos/<source>/<frame>.jpg, resized.
 *
 * Every mapping was checked by eye against our exercise. `variant` marks a
 * photo of a close variation (e.g. cable instead of band) and says what differs.
 */
export interface DemoPhotos {
  source: string;
  /** Exercise name in the source dataset. */
  name: string;
  /** Which frames to show (default both: 0 = one end of the movement, 1 = the other). */
  frames?: number[];
  variant?: string;
}

export const DEMO_SOURCE_URL = "https://github.com/yuhonas/free-exercise-db";

export const DEMO_PHOTOS: Record<string, DemoPhotos> = {
  "assisted-pull-up": { source: "Band_Assisted_Pull-Up", name: "Band Assisted Pull-Up" },
  "band-chest-press": { source: "Standing_Cable_Chest_Press", name: "Standing Cable Chest Press", variant: "Shown with cables — a band anchored behind you works the same way" },
  "band-curl": { source: "Standing_Biceps_Cable_Curl", name: "Standing Biceps Cable Curl", variant: "Shown with a cable — stand on the band for the same curl" },
  "band-good-morning": { source: "Band_Good_Morning", name: "Band Good Morning" },
  "band-lat-pulldown": { source: "Wide-Grip_Lat_Pulldown", name: "Wide-Grip Lat Pulldown", variant: "Shown on a cable machine — anchor the band high for the same pull" },
  "band-lateral-raise": { source: "Lateral_Raise_-_With_Bands", name: "Lateral Raise - With Bands" },
  "band-overhead-press": { source: "Shoulder_Press_-_With_Bands", name: "Shoulder Press - With Bands" },
  "band-pallof-press": { source: "Pallof_Press", name: "Pallof Press", variant: "Shown with a cable — anchor the band at chest height for the same press" },
  "band-pull-apart": { source: "Band_Pull_Apart", name: "Band Pull Apart" },
  "band-row": { source: "Seated_Cable_Rows", name: "Seated Cable Rows", variant: "Shown with a cable — loop the band around your feet for the same row" },
  "band-squat": { source: "Squats_-_With_Bands", name: "Squats - With Bands" },
  "band-triceps-pushdown": { source: "Triceps_Pushdown", name: "Triceps Pushdown", variant: "Shown with a cable — anchor the band high for the same pushdown" },
  "barbell-back-squat": { source: "Barbell_Squat", name: "Barbell Squat" },
  "barbell-bench-press": { source: "Barbell_Bench_Press_-_Medium_Grip", name: "Barbell Bench Press - Medium Grip" },
  "barbell-curl": { source: "Barbell_Curl", name: "Barbell Curl" },
  "barbell-hip-thrust": { source: "Barbell_Hip_Thrust", name: "Barbell Hip Thrust" },
  "barbell-row": { source: "Bent_Over_Barbell_Row", name: "Bent Over Barbell Row" },
  "bench-dip": { source: "Bench_Dips", name: "Bench Dips" },
  "bodyweight-reverse-lunge": { source: "Dumbbell_Rear_Lunge", name: "Dumbbell Rear Lunge", variant: "Shown holding dumbbells — do the same step without weights" },
  "bodyweight-squat": { source: "Bodyweight_Squat", name: "Bodyweight Squat" },
  "box-squat": { source: "Box_Squat", name: "Box Squat" },
  "bulgarian-split-squat": { source: "Split_Squat_with_Dumbbells", name: "Split Squat with Dumbbells" },
  "cable-chest-fly": { source: "Cable_Crossover", name: "Cable Crossover" },
  "cable-crunch": { source: "Cable_Crunch", name: "Cable Crunch" },
  "cable-curl": { source: "Standing_Biceps_Cable_Curl", name: "Standing Biceps Cable Curl" },
  "cable-lateral-raise": { source: "Standing_Low-Pulley_Deltoid_Raise", name: "Standing Low-Pulley Deltoid Raise" },
  "cable-pallof-press": { source: "Pallof_Press", name: "Pallof Press" },
  "cable-pull-through": { source: "Pull_Through", name: "Pull Through" },
  "chest-supported-machine-row": { source: "Leverage_Iso_Row", name: "Leverage Iso Row" },
  "chin-up": { source: "Chin-Up", name: "Chin-Up" },
  "close-grip-bench-press": { source: "Close-Grip_Barbell_Bench_Press", name: "Close-Grip Barbell Bench Press" },
  "conventional-deadlift": { source: "Barbell_Deadlift", name: "Barbell Deadlift" },
  "crunch": { source: "Crunches", name: "Crunches" },
  "dead-bug": { source: "Dead_Bug", name: "Dead Bug" },
  "diamond-push-up": { source: "Push-Ups_-_Close_Triceps_Position", name: "Push-Ups - Close Triceps Position" },
  "doorframe-row": { source: "Inverted_Row", name: "Inverted Row", variant: "Shown as an inverted row under a bar — the same pull with your body leaning back" },
  "dumbbell-bench-press": { source: "Dumbbell_Bench_Press", name: "Dumbbell Bench Press" },
  "dumbbell-biceps-curl": { source: "Dumbbell_Bicep_Curl", name: "Dumbbell Bicep Curl" },
  "dumbbell-fly": { source: "Dumbbell_Flyes", name: "Dumbbell Flyes" },
  "dumbbell-hip-thrust": { source: "Barbell_Hip_Thrust", name: "Barbell Hip Thrust", variant: "Shown with a barbell — hold a dumbbell on your hips instead" },
  "dumbbell-lateral-raise": { source: "Side_Lateral_Raise", name: "Side Lateral Raise" },
  "dumbbell-reverse-lunge": { source: "Dumbbell_Rear_Lunge", name: "Dumbbell Rear Lunge" },
  "dumbbell-romanian-deadlift": { source: "Stiff-Legged_Dumbbell_Deadlift", name: "Stiff-Legged Dumbbell Deadlift" },
  "dumbbell-skull-crusher": { source: "Lying_Dumbbell_Tricep_Extension", name: "Lying Dumbbell Tricep Extension" },
  "face-pull": { source: "Face_Pull", name: "Face Pull" },
  "farmers-carry": { source: "Farmers_Walk", name: "Farmer's Walk" },
  "front-squat": { source: "Front_Barbell_Squat", name: "Front Barbell Squat" },
  "glute-bridge": { source: "Butt_Lift_Bridge", name: "Butt Lift (Bridge)" },
  "goblet-squat": { source: "Goblet_Squat", name: "Goblet Squat" },
  "hammer-curl": { source: "Hammer_Curls", name: "Hammer Curls" },
  "hanging-knee-raise": { source: "Knee_Hip_Raise_On_Parallel_Bars", name: "Knee/Hip Raise On Parallel Bars", variant: "Shown on a captain's chair — hanging from a bar uses the same knee raise" },
  "incline-barbell-bench-press": { source: "Barbell_Incline_Bench_Press_-_Medium_Grip", name: "Barbell Incline Bench Press - Medium Grip" },
  "incline-dumbbell-press": { source: "Incline_Dumbbell_Press", name: "Incline Dumbbell Press" },
  "incline-push-up": { source: "Incline_Push-Up", name: "Incline Push-Up" },
  "incline-treadmill-walk": { source: "Walking_Treadmill", name: "Walking, Treadmill", frames: [0] },
  "kettlebell-swing": { source: "One-Arm_Kettlebell_Swings", name: "One-Arm Kettlebell Swings", variant: "Shown one-handed — the two-handed swing uses the same hip drive" },
  "lat-pulldown": { source: "Wide-Grip_Lat_Pulldown", name: "Wide-Grip Lat Pulldown" },
  "leg-extension": { source: "Leg_Extensions", name: "Leg Extensions" },
  "leg-press": { source: "Leg_Press", name: "Leg Press" },
  "lying-leg-curl": { source: "Lying_Leg_Curls", name: "Lying Leg Curls" },
  "machine-calf-raise": { source: "Standing_Calf_Raises", name: "Standing Calf Raises" },
  "machine-chest-press": { source: "Machine_Bench_Press", name: "Machine Bench Press" },
  "machine-shoulder-press": { source: "Machine_Shoulder_Military_Press", name: "Machine Shoulder (Military) Press" },
  "mountain-climber": { source: "Mountain_Climbers", name: "Mountain Climbers" },
  "one-arm-dumbbell-row": { source: "One-Arm_Dumbbell_Row", name: "One-Arm Dumbbell Row" },
  "overhead-dumbbell-triceps-extension": { source: "Standing_Dumbbell_Triceps_Extension", name: "Standing Dumbbell Triceps Extension" },
  "overhead-press": { source: "Standing_Military_Press", name: "Standing Military Press" },
  "plank": { source: "Plank", name: "Plank", frames: [1] },
  "pull-up": { source: "Pullups", name: "Pullups" },
  "push-up": { source: "Pushups", name: "Pushups" },
  "reverse-dumbbell-fly": { source: "Seated_Bent-Over_Rear_Delt_Raise", name: "Seated Bent-Over Rear Delt Raise" },
  "romanian-deadlift": { source: "Romanian_Deadlift", name: "Romanian Deadlift" },
  "rowing-machine": { source: "Rowing_Stationary", name: "Rowing, Stationary" },
  "seated-cable-row": { source: "Seated_Cable_Rows", name: "Seated Cable Rows" },
  "seated-dumbbell-shoulder-press": { source: "Seated_Dumbbell_Press", name: "Seated Dumbbell Press" },
  "side-plank": { source: "Side_Bridge", name: "Side Bridge" },
  "single-leg-glute-bridge": { source: "Single_Leg_Glute_Bridge", name: "Single Leg Glute Bridge" },
  "standing-calf-raise": { source: "Standing_Dumbbell_Calf_Raise", name: "Standing Dumbbell Calf Raise" },
  "stationary-bike": { source: "Bicycling_Stationary", name: "Bicycling, Stationary", frames: [0] },
  "step-up": { source: "Dumbbell_Step_Ups", name: "Dumbbell Step Ups" },
  "suitcase-carry": { source: "Farmers_Walk", name: "Farmer's Walk", variant: "Shown with a weight in each hand — carry just one, on one side, and stay upright" },
  "treadmill-run": { source: "Running_Treadmill", name: "Running, Treadmill", frames: [0] },
  "triceps-pushdown": { source: "Triceps_Pushdown", name: "Triceps Pushdown" },
  "walking-lunge": { source: "Bodyweight_Walking_Lunge", name: "Bodyweight Walking Lunge" },
};

export function demoPhotoUrls(exerciseId: string): string[] {
  const d = DEMO_PHOTOS[exerciseId];
  if (!d) return [];
  return (d.frames ?? [0, 1]).map((n) => `/demos/${d.source}/${n}.jpg`);
}

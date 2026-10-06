import type {
  Equipment,
  ExerciseEquipment,
  FitnessLevel,
  Gender,
  Goal,
  Limitation,
  MovementPattern,
  Muscle,
  PreferredTime,
  WorkoutLocation,
} from "./enums.js";

/** Human-readable labels shared by the API (prompts) and the web client. */
export const GOAL_LABELS: Record<Goal, string> = {
  weight_loss: "Weight loss",
  muscle_gain: "Muscle gain",
  strength: "Strength",
  endurance: "Endurance",
  general_fitness: "General fitness",
  body_recomposition: "Body recomposition",
};

export const LEVEL_LABELS: Record<FitnessLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

export const LOCATION_LABELS: Record<WorkoutLocation, string> = {
  home: "Home",
  gym: "Gym",
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: "No equipment",
  dumbbells: "Dumbbells",
  barbell: "Barbell",
  resistance_bands: "Resistance bands",
  machines: "Machines",
  full_gym: "Full gym",
};

export const EXERCISE_EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  bodyweight: "Bodyweight",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  resistance_band: "Resistance band",
  machine: "Machine",
  cable: "Cable",
  kettlebell: "Kettlebell",
  pullup_bar: "Pull-up bar",
};

export const TIME_LABELS: Record<PreferredTime, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  flexible: "Flexible",
};

export const LIMITATION_LABELS: Record<Limitation, string> = {
  avoid_overhead: "Avoid overhead pressing",
  avoid_jumping: "Avoid jumping / impact",
  avoid_deep_knee_flexion: "Avoid deep knee bending",
  avoid_spinal_loading: "Avoid heavy spinal loading",
  avoid_floor_work: "Avoid getting on the floor",
  avoid_running: "Avoid running",
  wrist_friendly: "Go easy on wrists",
};

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: "Chest",
  back: "Back",
  lats: "Lats",
  traps: "Traps",
  shoulders: "Shoulders",
  rear_delts: "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  obliques: "Obliques",
  lower_back: "Lower back",
  glutes: "Glutes",
  quadriceps: "Quadriceps",
  hamstrings: "Hamstrings",
  calves: "Calves",
  hip_flexors: "Hip flexors",
  adductors: "Adductors",
  full_body: "Full body",
};

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: "Squat",
  hinge: "Hip hinge",
  lunge: "Lunge",
  horizontal_push: "Horizontal push",
  vertical_push: "Vertical push",
  horizontal_pull: "Horizontal pull",
  vertical_pull: "Vertical pull",
  elbow_flexion: "Arm curl",
  elbow_extension: "Arm extension",
  shoulder_isolation: "Shoulder isolation",
  chest_isolation: "Chest isolation",
  knee_extension: "Knee extension",
  knee_flexion: "Knee flexion",
  calf_raise: "Calf raise",
  core_anti_extension: "Core stability",
  core_flexion: "Core flexion",
  core_rotation: "Rotation & anti-rotation",
  carry: "Carry",
  conditioning: "Conditioning",
};

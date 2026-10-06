import type { ReactNode } from "react";
import {
  Activity,
  Bike,
  Building2,
  Dumbbell,
  Flame,
  HeartPulse,
  Home,
  Scale,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  GENDERS,
  GENDER_LABELS,
  GOAL_LABELS,
  LIMITATIONS,
  LIMITATION_LABELS,
  PREFERRED_TIMES,
  TIME_LABELS,
  type Equipment,
  type FitnessLevel,
  type Goal,
  type ProfileInput,
} from "@gymfit/shared";
import { Chip, Field, NumberStepper, OptionCard } from "../../components/ui";

export type Draft = ProfileInput;
type StepProps = { draft: Draft; set: (patch: Partial<Draft>) => void };

export function AboutStep({ draft, set }: StepProps) {
  return (
    <div className="stack">
      <Field label="Name" htmlFor="name">
        <input
          id="name"
          className="input"
          value={draft.name}
          maxLength={60}
          autoComplete="given-name"
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Age">
        <NumberStepper label="age" value={draft.age} min={16} max={100} onChange={(age) => set({ age })} suffix="yrs" />
      </Field>
      <Field label="Gender">
        <div className="chips">
          {GENDERS.map((g) => (
            <Chip key={g} selected={draft.gender === g} onClick={() => set({ gender: g })}>
              {GENDER_LABELS[g]}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Field label="Height" htmlFor="height">
          <div className="input-suffix">
            <input
              id="height"
              className="input"
              type="number"
              inputMode="decimal"
              min={120}
              max={230}
              value={draft.heightCm || ""}
              onChange={(e) => set({ heightCm: Number(e.target.value) })}
            />
            <span>cm</span>
          </div>
        </Field>
        <Field label="Weight" htmlFor="weight">
          <div className="input-suffix">
            <input
              id="weight"
              className="input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={30}
              max={300}
              value={draft.weightKg || ""}
              onChange={(e) => set({ weightKg: Number(e.target.value) })}
            />
            <span>kg</span>
          </div>
        </Field>
      </div>
    </div>
  );
}

const LEVELS: { id: FitnessLevel; title: string; desc: string }[] = [
  { id: "beginner", title: "Beginner", desc: "New to training or returning after a long break." },
  { id: "intermediate", title: "Intermediate", desc: "Training consistently for 6+ months, familiar with the main lifts." },
  { id: "advanced", title: "Advanced", desc: "Years of structured training; comfortable with heavy compound lifts." },
];

export function LevelStep({ draft, set }: StepProps) {
  return (
    <div className="stack">
      {LEVELS.map((l) => (
        <OptionCard
          key={l.id}
          selected={draft.fitnessLevel === l.id}
          onClick={() => set({ fitnessLevel: l.id })}
          title={l.title}
          description={l.desc}
          icon={<TrendingUp size={18} />}
        />
      ))}
    </div>
  );
}

const GOAL_ICONS: Record<Goal, ReactNode> = {
  weight_loss: <Flame size={18} />,
  muscle_gain: <Dumbbell size={18} />,
  strength: <Trophy size={18} />,
  endurance: <HeartPulse size={18} />,
  general_fitness: <Activity size={18} />,
  body_recomposition: <Sparkles size={18} />,
};
const GOAL_DESC: Record<Goal, string> = {
  weight_loss: "Lose fat while keeping muscle",
  muscle_gain: "Build size",
  strength: "Lift heavier",
  endurance: "Go longer",
  general_fitness: "Feel and move better",
  body_recomposition: "Lose fat, gain muscle",
};

export function GoalStep({ draft, set }: StepProps) {
  const wantsTarget = ["weight_loss", "muscle_gain", "body_recomposition"].includes(draft.goal);
  return (
    <div className="stack">
      <div className="option-grid">
        {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
          <OptionCard
            key={g}
            selected={draft.goal === g}
            onClick={() => set({ goal: g })}
            title={GOAL_LABELS[g]}
            description={GOAL_DESC[g]}
            icon={GOAL_ICONS[g]}
          />
        ))}
      </div>
      {wantsTarget && (
        <Field label="Target weight (optional)" htmlFor="target">
          <div className="input-suffix">
            <input
              id="target"
              className="input"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="e.g. 72"
              value={draft.targetWeightKg ?? ""}
              onChange={(e) => set({ targetWeightKg: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <span>kg</span>
          </div>
        </Field>
      )}
    </div>
  );
}

export function EquipmentStep({ draft, set }: StepProps) {
  function toggle(item: Equipment) {
    let next = draft.equipment.includes(item) ? draft.equipment.filter((e) => e !== item) : [...draft.equipment, item];
    if (item === "full_gym" && next.includes("full_gym")) next = ["full_gym"];
    else if (item !== "full_gym") next = next.filter((e) => e !== "full_gym");
    if (item === "none" && next.includes("none")) next = ["none"];
    else if (item !== "none") next = next.filter((e) => e !== "none");
    set({ equipment: next.length ? next : ["none"] });
  }
  return (
    <div className="stack">
      <div className="option-grid">
        <OptionCard
          selected={draft.location === "home"}
          onClick={() => set({ location: "home", equipment: draft.equipment.includes("full_gym") ? ["none"] : draft.equipment })}
          title="Home"
          description="Train where you live"
          icon={<Home size={18} />}
        />
        <OptionCard
          selected={draft.location === "gym"}
          onClick={() => set({ location: "gym", equipment: ["full_gym"] })}
          title="Gym"
          description="Commercial or campus gym"
          icon={<Building2 size={18} />}
        />
      </div>
      <Field label="Available equipment">
        <div className="chips">
          {EQUIPMENT.map((e) => (
            <Chip key={e} selected={draft.equipment.includes(e)} onClick={() => toggle(e)}>
              {EQUIPMENT_LABELS[e]}
            </Chip>
          ))}
        </div>
      </Field>
      <p className="small faint">Your plan will only include exercises you can do with this equipment.</p>
    </div>
  );
}

const DURATIONS = [20, 30, 45, 60, 75, 90];

export function ScheduleStep({ draft, set }: StepProps) {
  return (
    <div className="stack">
      <Field label="Days per week">
        <NumberStepper
          label="days per week"
          value={draft.daysPerWeek}
          min={1}
          max={6}
          onChange={(daysPerWeek) => set({ daysPerWeek })}
          suffix="days"
        />
      </Field>
      <Field label="Workout duration">
        <div className="chips">
          {DURATIONS.map((m) => (
            <Chip key={m} selected={draft.sessionMinutes === m} onClick={() => set({ sessionMinutes: m })}>
              {m} min
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Preferred time">
        <div className="chips">
          {PREFERRED_TIMES.map((t) => (
            <Chip key={t} selected={draft.preferredTime === t} onClick={() => set({ preferredTime: t })}>
              {TIME_LABELS[t]}
            </Chip>
          ))}
        </div>
      </Field>
      {draft.daysPerWeek === 6 && (
        <p className="small faint">Six days is a lot of training — the plan will alternate muscle groups so each gets recovery time.</p>
      )}
    </div>
  );
}

export function LimitationsStep({ draft, set }: StepProps) {
  const toggle = (l: (typeof LIMITATIONS)[number]) =>
    set({
      limitations: draft.limitations.includes(l) ? draft.limitations.filter((x) => x !== l) : [...draft.limitations, l],
    });
  return (
    <div className="stack">
      <p className="muted small">Select any movements you want to avoid. Exercises involving them won't be recommended.</p>
      <div className="chips">
        {LIMITATIONS.map((l) => (
          <Chip key={l} selected={draft.limitations.includes(l)} onClick={() => toggle(l)}>
            {LIMITATION_LABELS[l]}
          </Chip>
        ))}
      </div>
      <Field label="Anything else? (optional)" htmlFor="notes">
        <textarea
          id="notes"
          className="textarea"
          maxLength={500}
          placeholder="e.g. old shoulder injury, prefer low impact"
          value={draft.limitationNotes}
          onChange={(e) => set({ limitationNotes: e.target.value })}
        />
      </Field>
      <div className="alert alert-info">
        <Scale size={18} style={{ flexShrink: 0 }} />
        <span>
          GymFit Pro is a fitness tool, not a medical service. If you have an injury, pain, or a health condition, please
          check with a doctor or physiotherapist before starting a new program.
        </span>
      </div>
    </div>
  );
}

export const STEP_META = [
  { title: "About you", subtitle: "This helps personalise your plan.", icon: <Target size={18} /> },
  { title: "Your experience", subtitle: "Be honest — it keeps your plan safe and effective.", icon: <TrendingUp size={18} /> },
  { title: "Your main goal", subtitle: "We'll shape sets, reps and rest around it.", icon: <Trophy size={18} /> },
  { title: "Where you train", subtitle: "Tell us what you have access to.", icon: <Dumbbell size={18} /> },
  { title: "Your schedule", subtitle: "We'll fit workouts into your week.", icon: <Bike size={18} /> },
  { title: "Limitations", subtitle: "Optional — skip if none apply.", icon: <HeartPulse size={18} /> },
];

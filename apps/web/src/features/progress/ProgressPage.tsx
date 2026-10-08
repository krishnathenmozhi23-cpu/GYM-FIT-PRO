import { useMemo, useState } from "react";
import { Flame, Plus, Scale, Target, Trophy } from "lucide-react";
import type { ProgressOverview } from "@gymfit/shared";
import { Button, Chip, EmptyState, ErrorState, ProgressBar, SkeletonBlock } from "../../components/ui";
import { api } from "../../lib/api";
import { formatKg, shortDate } from "../../lib/format";
import { useAsync } from "../../lib/useAsync";
import { Bars, ChartCard, MultiLine, TrendLine } from "./charts";
import { LogEntrySheet } from "./LogEntrySheet";

const BMI_LABEL = { underweight: "Underweight", healthy: "Healthy range", overweight: "Overweight", obese: "Obese" } as const;
const SITE_NAMES = { chestCm: "Chest", waistCm: "Waist", hipsCm: "Hips", armCm: "Arm", thighCm: "Thigh", neckCm: "Neck" } as const;

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="card card-tight stack-sm">
      <span style={{ color: "var(--accent)" }}>{icon}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function ProgressPage() {
  const { data, error, loading, reload, setData } = useAsync(() => api.get<{ progress: ProgressOverview }>("/progress"));
  const [sheet, setSheet] = useState<null | "weight" | "measurement">(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const p = data?.progress;

  const strength = useMemo(() => {
    if (!p?.strength.length) return null;
    return p.strength.find((s) => s.exerciseId === exerciseId) ?? p.strength[0]!;
  }, [p, exerciseId]);
  const measurementSeries = useMemo(
    () => (Object.keys(SITE_NAMES) as (keyof typeof SITE_NAMES)[]).filter((k) => p?.measurements.some((m) => m[k] !== null)).map((k) => ({ key: k, name: SITE_NAMES[k] })),
    [p],
  );

  if (loading) return <div className="page"><SkeletonBlock height={140} /><SkeletonBlock height={240} /><SkeletonBlock height={240} /></div>;
  if (error || !p) return <ErrorState message={error ?? "Couldn't load progress"} onRetry={reload} />;

  const weightDelta = p.currentWeightKg !== null && p.startWeightKg !== null ? p.currentWeightKg - p.startWeightKg : null;
  const weekKcal = p.weeklyActivity.at(-1)?.estimatedKcal;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Progress</h1>
        <Button small onClick={() => setSheet("weight")}>
          <Plus size={16} /> Log
        </Button>
      </div>

      <div className="card stack">
        <div className="row-between">
          <div className="row">
            <Target size={18} color="var(--accent)" />
            <h2 className="section-title">{p.goal.label}</h2>
          </div>
          {p.goal.percent !== null && <span className="stat-value" style={{ fontSize: 22 }}>{p.goal.percent}%</span>}
        </div>
        {p.goal.percent !== null && <ProgressBar value={p.goal.percent} label="Goal progress" />}
        <span className="small muted">{p.goal.detail}</span>
      </div>

      <div className="grid-2">
        <Stat icon={<Trophy size={18} />} value={String(p.totalWorkouts)} label="Total workouts" />
        <Stat icon={<Flame size={18} />} value={`${p.currentStreakWeeks} wk`} label={`Streak (best ${p.longestStreakWeeks} wk)`} />
        <Stat icon={<Scale size={18} />} value={formatKg(p.currentWeightKg)} label={weightDelta === null || weightDelta === 0 ? "Current weight" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg since start`} />
        <div className="card card-tight stack-sm">
          <span className="small muted">BMI</span>
          <span className="stat-value">{p.bmi?.value ?? "—"}</span>
          <span className="stat-label">{p.bmi?.category ? BMI_LABEL[p.bmi.category] : "Informational only"}</span>
        </div>
      </div>
      <p className="small faint">
        BMI is a rough population screening measure and doesn't account for muscle mass. The streak counts weeks in a row you hit your weekly workout target.
        {weekKcal ? ` This week's activity ≈ ${weekKcal} kcal (rough estimate from workout time and body weight).` : ""}
      </p>

      <ChartCard
        title="Weight"
        subtitle={p.weight.length ? `${p.weight.length} entries` : undefined}
        rows={p.weight}
        columns={[{ key: "date", label: "Date", format: (v) => shortDate(String(v)) }, { key: "weightKg", label: "kg" }, { key: "bodyFatPct", label: "Body fat %", format: (v) => (v === null ? "—" : String(v)) }]}
        empty={<EmptyState title="No weigh-ins yet" />}
      >
        <TrendLine data={p.weight} x="date" y="weightKg" name="Weight" unit="kg" />
      </ChartCard>

      <ChartCard
        title="Workout frequency"
        subtitle="Workouts per week, last 8 weeks"
        rows={p.totalWorkouts ? p.weeklyActivity : []}
        empty={<EmptyState title="No workouts yet" message="Finish a workout to start tracking frequency." />}
        columns={[{ key: "weekStart", label: "Week of", format: (v) => shortDate(String(v)) }, { key: "workouts", label: "Workouts" }]}
      >
        <Bars data={p.weeklyActivity} x="weekStart" y="workouts" name="Workouts" unit="" />
      </ChartCard>

      <ChartCard
        title="Weekly activity"
        subtitle="Training minutes per week"
        rows={p.totalWorkouts ? p.weeklyActivity : []}
        empty={<EmptyState title="No activity yet" />}
        columns={[
          { key: "weekStart", label: "Week of", format: (v) => shortDate(String(v)) },
          { key: "minutes", label: "Minutes" },
          { key: "volumeKg", label: "Volume kg" },
          { key: "estimatedKcal", label: "≈ kcal", format: (v) => (v === null ? "—" : String(v)) },
        ]}
      >
        <Bars data={p.weeklyActivity} x="weekStart" y="minutes" name="Minutes" unit="min" />
      </ChartCard>

      <ChartCard
        title="Strength progress"
        subtitle={strength ? `${strength.exerciseName} — estimated 1-rep max` : undefined}
        rows={strength?.points ?? []}
        columns={[
          { key: "date", label: "Date", format: (v) => shortDate(String(v)) },
          { key: "estimated1RmKg", label: "Est. 1RM kg" },
          { key: "bestWeightKg", label: "Best set kg" },
          { key: "bestReps", label: "Reps" },
        ]}
        empty={<EmptyState title="No strength data yet" message="Log weighted sets in your workouts to see estimated 1-rep max trends." />}
      >
        <TrendLine data={strength?.points ?? []} x="date" y="estimated1RmKg" name="Est. 1RM" unit="kg" />
      </ChartCard>
      {p.strength.length > 1 && (
        <div className="scroll-x" aria-label="Choose exercise">
          {p.strength.map((s) => (
            <Chip key={s.exerciseId} selected={strength?.exerciseId === s.exerciseId} onClick={() => setExerciseId(s.exerciseId)}>
              {s.exerciseName}
            </Chip>
          ))}
        </div>
      )}

      <ChartCard
        title="Body measurements"
        rows={p.measurements}
        columns={[{ key: "date", label: "Date", format: (v) => shortDate(String(v)) }, ...measurementSeries.map((s) => ({ key: s.key, label: s.name, format: (v: unknown) => (v === null ? "—" : String(v)) }))]}
        empty={<EmptyState title="No measurements yet" action={<Button small variant="secondary" onClick={() => setSheet("measurement")}>Add measurements</Button>} />}
      >
        <MultiLine data={p.measurements} x="date" series={measurementSeries} unit="cm" />
      </ChartCard>

      {sheet && <LogEntrySheet open initial={sheet} onClose={() => setSheet(null)} onSaved={(np) => setData({ progress: np })} />}
    </div>
  );
}

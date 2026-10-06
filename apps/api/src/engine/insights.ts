import type { Goal, Insight, StrengthSeries, WeightPoint } from "@gymfit/shared";
import { daysBetween, startOfWeek, addDays } from "../lib/dates.js";

export interface InsightInput {
  today: string;
  goal: Goal;
  daysPerWeek: number;
  sessions: { date: string; difficultyRating: number | null }[];
  strength: StrengthSeries[];
  weight: WeightPoint[];
  streakWeeks: number;
}

const ORDER: Insight["kind"][] = ["safety", "progress", "recovery", "consistency", "goal", "tip"];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Weekly best e1RM per exercise, ascending by week. */
function weeklyBest(points: StrengthSeries["points"]): { week: string; best: number }[] {
  const m = new Map<string, number>();
  for (const p of points) {
    const w = startOfWeek(p.date);
    m.set(w, Math.max(m.get(w) ?? 0, p.estimated1RmKg));
  }
  return [...m].map(([week, best]) => ({ week, best })).sort((a, b) => a.week.localeCompare(b.week));
}

/** Data-backed insights. Every insight carries the evidence it is based on. */
export function computeInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];

  if (input.sessions.length === 0) {
    out.push({
      kind: "tip",
      title: "Let's get your first workout in",
      message: "Complete your first workout and log your sets — your recommendations start adapting from there.",
      evidence: "No workouts logged yet",
    });
  }

  // Strength: consecutive weekly improvements and plateaus.
  for (const s of input.strength) {
    const weeks = weeklyBest(s.points);
    if (weeks.length < 3) continue;
    let streak = 0;
    for (let i = weeks.length - 1; i > 0 && weeks[i]!.best > weeks[i - 1]!.best; i--) streak++;
    const lastWeek = weeks.at(-1)!.week;
    const recent = daysBetween(lastWeek, startOfWeek(input.today)) <= 7;
    if (streak >= 2 && recent) {
      out.push({
        kind: "progress",
        title: `${s.exerciseName} is climbing`,
        message: `You've improved your ${s.exerciseName.toLowerCase()} performance for ${streak} consecutive weeks. Keep the technique solid as the weight goes up.`,
        evidence: `Estimated 1RM ${weeks[weeks.length - 1 - streak]!.best} → ${weeks.at(-1)!.best} kg`,
      });
    } else if (recent && weeks.length >= 4) {
      const last3 = weeks.slice(-3);
      const before = weeks.slice(0, -3);
      const bestBefore = Math.max(...before.map((w) => w.best));
      if (Math.max(...last3.map((w) => w.best)) <= bestBefore) {
        out.push({
          kind: "tip",
          title: `${s.exerciseName} has stalled`,
          message:
            "No new best in the last 3 weeks. Common fixes: make sure you're adding reps or weight when you hit the top of the range, prioritise sleep and protein, or take a lighter week to recover.",
          evidence: `Best estimated 1RM ${bestBefore} kg; last 3 weeks peaked at ${Math.max(...last3.map((w) => w.best))} kg`,
        });
      }
    }
  }

  // Recovery from session ratings (1 = very easy … 5 = too hard).
  const rated = input.sessions.filter((s) => s.difficultyRating !== null).slice(-3);
  const lastTwo = rated.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((s) => s.difficultyRating! >= 5)) {
    out.push({
      kind: "recovery",
      title: "Your last two workouts felt too hard",
      message: "We've eased off the volume for your next sessions. Prioritise sleep, and don't push through pain.",
      evidence: "Last 2 sessions rated 5/5",
    });
  } else if (rated.length === 3 && rated.every((s) => s.difficultyRating! <= 2)) {
    out.push({
      kind: "recovery",
      title: "Workouts are feeling easy",
      message: "As long as you're completing your sets, loads will step up gradually.",
      evidence: "Last 3 sessions rated 2/5 or easier",
    });
  }

  // Consistency this week + streak.
  const weekStart = startOfWeek(input.today);
  const thisWeek = input.sessions.filter((s) => s.date >= weekStart).length;
  if (input.streakWeeks >= 2) {
    out.push({
      kind: "consistency",
      title: `${input.streakWeeks}-week streak`,
      message: `You've hit your weekly target ${input.streakWeeks} weeks in a row. Consistency is what drives results.`,
      evidence: `${thisWeek}/${input.daysPerWeek} workouts so far this week`,
    });
  } else if (input.sessions.length > 0 && thisWeek >= input.daysPerWeek) {
    out.push({
      kind: "consistency",
      title: "Weekly target hit",
      message: "You've completed every planned workout this week. Enjoy the recovery.",
      evidence: `${thisWeek}/${input.daysPerWeek} workouts this week`,
    });
  }

  // Body-weight trend vs goal (needs ≥ 2 weigh-ins spanning ≥ 14 days in the last 6 weeks).
  const recentW = input.weight.filter((w) => w.date >= addDays(input.today, -42));
  if (recentW.length >= 2) {
    const first = recentW[0]!;
    const last = recentW.at(-1)!;
    const days = daysBetween(first.date, last.date);
    if (days >= 14) {
      const perWeek = ((last.weightKg - first.weightKg) / days) * 7;
      const pctPerWeek = (perWeek / first.weightKg) * 100;
      const evidence = `${first.weightKg} → ${last.weightKg} kg over ${Math.round(days / 7)} weeks (${perWeek > 0 ? "+" : ""}${r1(perWeek)} kg/week)`;
      if (pctPerWeek < -1) {
        out.push({
          kind: "safety",
          title: "Weight is dropping quickly",
          message:
            "You're losing more than about 1% of body weight per week, which is faster than commonly recommended. Make sure you're eating enough to recover — a dietitian or doctor can help set a sustainable pace.",
          evidence,
        });
      } else if (input.goal === "weight_loss" && perWeek > 0.2) {
        out.push({
          kind: "goal",
          title: "Weight is trending up",
          message: "Your weight has risen while your goal is weight loss. Training helps, but the trend is mostly driven by nutrition and daily activity.",
          evidence,
        });
      } else if (input.goal === "muscle_gain" && perWeek < -0.2) {
        out.push({
          kind: "goal",
          title: "Weight is trending down",
          message: "Building muscle is much easier in a small calorie surplus. If you're losing weight, you may not be eating enough to support muscle gain.",
          evidence,
        });
      } else if (input.goal === "weight_loss" && pctPerWeek <= -0.25) {
        out.push({
          kind: "goal",
          title: "Steady, sustainable progress",
          message: "Your weight is coming down at a sustainable pace. Keep it up.",
          evidence,
        });
      }
    }
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).slice(0, 4);
}

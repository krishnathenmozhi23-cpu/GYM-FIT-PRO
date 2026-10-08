import type { ScheduledDay, WeekSchedule } from "@gymfit/shared";
import { addDays, dayOfWeek } from "../lib/dates.js";

export interface ScheduleWorkout {
  id: string;
  position: number;
  dayOfWeek: number;
  title: string;
}

export interface ScheduleSession {
  id: string;
  workoutId: string | null;
  date: string; // local date the session was completed
  title: string;
}

const DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Picks `n` days from `free` as evenly spaced as possible (maximises recovery). */
function spread(free: number[], n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [free[0]!];
  return Array.from({ length: n }, (_, i) => free[Math.round((i * (free.length - 1)) / (n - 1))]!);
}

/**
 * Builds the current week. If the user is on track, planned weekdays are
 * kept. If a workout was missed, the remaining workouts are re-spread over
 * the rest of the week (starting today) so nothing is silently dropped;
 * anything that cannot fit is reported in `carriedOver` rather than
 * cramming multiple sessions into one day.
 */
export function buildWeekSchedule(
  workouts: readonly ScheduleWorkout[],
  completed: readonly ScheduleSession[],
  today: string,
  weekStart: string,
): WeekSchedule {
  const todayIdx = dayOfWeek(today);
  const ordered = [...workouts].sort((a, b) => a.position - b.position);
  const weekSessions = completed.filter((s) => s.date >= weekStart && s.date <= addDays(weekStart, 6));
  const doneWorkoutIds = new Set(weekSessions.map((s) => s.workoutId).filter(Boolean));
  const trainedDays = new Set(weekSessions.map((s) => dayOfWeek(s.date)));

  const remaining = ordered.filter((w) => !doneWorkoutIds.has(w.id));
  const free = Array.from({ length: 7 - todayIdx }, (_, i) => todayIdx + i).filter((d) => !trainedDays.has(d));
  const notes: string[] = [];

  const onTrack = remaining.every((w) => w.dayOfWeek >= todayIdx && free.includes(w.dayOfWeek));
  const assignment = new Map<number, { workout: ScheduleWorkout; rescheduled: boolean }>();
  let carriedOver: string[] = [];

  if (onTrack) {
    for (const w of remaining) assignment.set(w.dayOfWeek, { workout: w, rescheduled: false });
  } else {
    const fitting = remaining.slice(0, free.length);
    carriedOver = remaining.slice(free.length).map((w) => w.title);
    const days = spread(free, fitting.length);
    fitting.forEach((w, i) => {
      const day = days[i]!;
      const moved = day !== w.dayOfWeek;
      assignment.set(day, { workout: w, rescheduled: moved });
      if (moved && w.dayOfWeek < todayIdx) notes.push(`${w.title} was missed on ${DAY[w.dayOfWeek]} — moved to ${DAY[day]}.`);
    });
    if (carriedOver.length) {
      notes.push(`Not enough days left this week for: ${carriedOver.join(", ")}. It's better to skip than to double up — they'll be first next week.`);
    }
  }

  const days: ScheduledDay[] = Array.from({ length: 7 }, (_, d) => {
    const date = addDays(weekStart, d);
    const session = weekSessions.find((s) => s.date === date);
    if (session) {
      return { date, dayOfWeek: d, status: "completed", workoutId: session.workoutId, title: session.title, sessionId: session.id };
    }
    const planned = assignment.get(d);
    if (planned) {
      return {
        date,
        dayOfWeek: d,
        status: planned.rescheduled ? "missed_rescheduled" : "planned",
        workoutId: planned.workout.id,
        title: planned.workout.title,
        sessionId: null,
      };
    }
    return { date, dayOfWeek: d, status: "rest", workoutId: null, title: null, sessionId: null };
  });

  return {
    weekStart,
    days,
    completedCount: weekSessions.length,
    targetCount: ordered.length,
    carriedOver,
    notes,
  };
}

/** The next workout in rotation after the most recently completed one. */
export function nextInRotation(workouts: readonly ScheduleWorkout[], lastCompletedWorkoutId: string | null): ScheduleWorkout | null {
  const ordered = [...workouts].sort((a, b) => a.position - b.position);
  if (!ordered.length) return null;
  const idx = ordered.findIndex((w) => w.id === lastCompletedWorkoutId);
  return ordered[(idx + 1) % ordered.length]!;
}

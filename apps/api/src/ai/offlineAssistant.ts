import { PATTERN_LABELS, type AiChatOutput, type ChatAction, type DailyWorkoutRequest } from "@gymfit/shared";
import { findAlternatives } from "../engine/alternatives.js";
import { condenseWorkout } from "../engine/quickWorkout.js";
import { estimateWorkoutMinutes } from "../engine/prescription.js";
import type { UserContext } from "./context.js";

/**
 * Rule-based assistant used when no LLM is configured (AI_PROVIDER=none).
 * It is NOT a language model: it recognises common intents and answers
 * from the user's real data. Replies are labelled `rule_engine`.
 */
type Focus = NonNullable<DailyWorkoutRequest["focus"]>;
const FOCUS_WORDS: [RegExp, Focus][] = [
  [/\b(upper|upper body)\b/i, "upper"],
  [/\b(lower|lower body)\b/i, "lower"],
  [/\b(legs?|squat day)\b/i, "legs"],
  [/\b(push|chest)\b/i, "push"],
  [/\b(pull|back)\b/i, "pull"],
  [/\b(core|abs?)\b/i, "core"],
  [/\b(cardio|conditioning|hiit)\b/i, "conditioning"],
  [/\b(full[- ]?body)\b/i, "full_body"],
];

function detectFocus(msg: string): Focus | undefined {
  return FOCUS_WORDS.find(([re]) => re.test(msg))?.[1];
}

function findExerciseMention(msg: string, ctx: UserContext) {
  const lower = msg.toLowerCase();
  // Longest names first so "barbell bench press" beats "bench press".
  const sorted = [...ctx.library].sort((a, b) => b.name.length - a.name.length);
  const exact = sorted.find((e) => lower.includes(e.name.toLowerCase()));
  if (exact) return exact;
  const keywords = ["squat", "deadlift", "bench", "pull-up", "pullup", "push-up", "pushup", "row", "lunge", "plank", "curl", "press", "dip"];
  const kw = keywords.find((k) => lower.includes(k));
  if (!kw) return null;
  const norm = kw.replace("pullup", "pull-up").replace("pushup", "push-up");
  // Prefer an exercise from the user's plan that matches the keyword.
  const planIds = new Set(ctx.plan?.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)) ?? []);
  const matches = sorted.filter((e) => e.name.toLowerCase().includes(norm));
  return matches.find((e) => planIds.has(e.id)) ?? matches.at(-1) ?? null;
}

export function offlineAnswer(message: string, ctx: UserContext): AiChatOutput {
  const msg = message.trim();
  const today = ctx.todayInfo;
  const w = today.workout;
  const actions: ChatAction[] = [];

  // "I only have 30 minutes"
  const minutesMatch = msg.match(/(\d{2,3})\s*(min|mins|minutes)\b/i);
  if (minutesMatch && /(only|have|got|short|quick|time)/i.test(msg)) {
    const minutes = Math.max(10, Math.min(120, Number(minutesMatch[1])));
    const focus = detectFocus(msg);
    if (w && !focus) {
      const condensed = condenseWorkout(w.exercises, minutes);
      const names = condensed.map((e) => ctx.byId.get(e.exerciseId)?.name ?? e.exerciseId);
      return {
        reply: `With ${minutes} minutes, focus on the most important part of ${w.title}: ${names.join(", ")} (about ${estimateWorkoutMinutes(condensed)} min with a short warm-up). Later exercises are trimmed to fewer sets or dropped.`,
        actions: [{ type: "quick_workout", minutes, focus: undefined }],
        safetyNote: null,
      };
    }
    return {
      reply: `I can build a ${minutes}-minute ${focus ? focus.replace("_", " ") : "full body"} workout from your equipment.`,
      actions: [{ type: "quick_workout", minutes, focus: focus ?? "full_body" }],
      safetyNote: null,
    };
  }

  // Alternatives: "alternative for squats", "I don't have a barbell"
  if (/(alternative|instead of|replace|substitute|swap|don'?t have|can'?t do)/i.test(msg)) {
    const target = findExerciseMention(msg, ctx);
    if (target) {
      const alts = findAlternatives(target, ctx.library, ctx.profile).filter((a) => a.available).slice(0, 3);
      if (alts.length) {
        return {
          reply: `Alternatives to ${target.name} (${PATTERN_LABELS[target.pattern].toLowerCase()}) that fit your equipment:\n${alts
            .map((a, i) => `${i + 1}. ${a.exercise.name}`)
            .join("\n")}\nDuring a workout you can tap "Replace" to swap it in.`,
          actions: alts.slice(0, 3).map((a) => ({ type: "view_exercise" as const, exerciseId: a.exercise.id })),
          safetyNote: null,
        };
      }
      return { reply: `I couldn't find an alternative to ${target.name} that matches your equipment and limitations.`, actions: [], safetyNote: null };
    }
    const noBarbell = /barbell/i.test(msg);
    return {
      reply: noBarbell
        ? "No barbell? Dumbbell, machine and bodyweight versions cover the same movements — e.g. dumbbell bench press or push-ups for bench press, goblet squats for back squats, dumbbell Romanian deadlifts for deadlifts. Update your equipment in Profile and I'll rebuild your plan around what you have."
        : "Which exercise would you like to replace? For example: \"alternative for barbell squat\".",
      actions: noBarbell ? [{ type: "regenerate_plan" }] : [],
      safetyNote: null,
    };
  }

  // Missed a workout
  if (/(missed|skipped|didn'?t (go|train|work ?out)|couldn'?t (go|train))/i.test(msg)) {
    const notes = today.schedule?.notes ?? [];
    return {
      reply: `No problem — one missed session doesn't undo your progress. ${
        notes.length ? notes.join(" ") : "Your remaining workouts have been spread over the rest of the week."
      } Don't try to double up; just pick up with ${w ? w.title : "your next workout"}.`,
      actions: w && !today.completedToday ? [{ type: "start_today" }] : [],
      safetyNote: null,
    };
  }

  // Not progressing
  if (/(not progress|plateau|stuck|stall|no progress|not getting (stronger|bigger)|not losing)/i.test(msg)) {
    const evidence = ctx.insights.filter((i) => i.kind !== "tip" || /stalled/.test(i.title));
    const done = today.schedule ? `${today.schedule.completedCount}/${today.schedule.targetCount} workouts this week` : null;
    return {
      reply: [
        "Here's what your data shows:",
        ...(evidence.length ? evidence.map((i) => `• ${i.title} — ${i.evidence}`) : ["• Not enough logged workouts yet to spot a trend."]),
        done ? `• ${done}` : "",
        "",
        "Common reasons progress stalls: inconsistent training, not adding reps or weight over time, too little sleep or protein, or not enough recovery. Log every set so the app can raise loads when you're ready.",
      ]
        .filter(Boolean)
        .join("\n"),
      actions: [],
      safetyNote: null,
    };
  }

  // Create a workout
  if (/(create|make|build|give me|design).*(workout|routine|session)/i.test(msg)) {
    const focus = detectFocus(msg) ?? "full_body";
    const minutes = Number(msg.match(/(\d{2,3})\s*min/i)?.[1] ?? ctx.profile.sessionMinutes);
    return {
      reply: `Here's a ${focus.replace("_", " ")} workout built for your ${ctx.profile.fitnessLevel} level and equipment. Tap below to generate it.`,
      actions: [{ type: "quick_workout", minutes: Math.max(10, Math.min(120, minutes)), focus }],
      safetyNote: null,
    };
  }

  // What should I train today?
  if (/(today|train|workout|what should i do|what'?s next)/i.test(msg)) {
    if (!w) return { reply: "You don't have a plan yet — generate one from the Workouts tab.", actions: [{ type: "regenerate_plan" }], safetyNote: null };
    if (today.completedToday) {
      return { reply: `You've already trained today — nice work. Rest and recover; next up is ${w.title}.`, actions: [], safetyNote: null };
    }
    const list = w.exercises.slice(0, 6).map((e, i) => `${i + 1}. ${e.exerciseName}`).join("\n");
    if (today.isRestDay) {
      actions.push({ type: "start_today" });
      return {
        reply: `Today is a planned rest day. If you feel recovered and want to train, your next workout is ${w.title} (~${w.estimatedMinutes} min):\n${list}`,
        actions,
        safetyNote: null,
      };
    }
    return {
      reply: `Today is ${w.title} (~${w.estimatedMinutes} min):\n${list}`,
      actions: [{ type: "start_today" }],
      safetyNote: null,
    };
  }

  if (/(weight|weigh)/i.test(msg)) {
    return { reply: "You can log your body weight from the Progress tab — regular weigh-ins make your trend and goal tracking accurate.", actions: [{ type: "log_weight" }], safetyNote: null };
  }

  return {
    reply:
      "I'm running in offline mode (no AI model configured), so I can help with:\n• \"What should I train today?\"\n• \"I only have 30 minutes\"\n• \"Alternative for squats\"\n• \"I missed yesterday's workout\"\n• \"Why am I not progressing?\"\n• \"Create a beginner upper body workout\"",
    actions: [],
    safetyNote: null,
  };
}

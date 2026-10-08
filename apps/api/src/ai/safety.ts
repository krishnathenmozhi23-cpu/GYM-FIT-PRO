/**
 * Deterministic safety layer around the assistant. It does not diagnose;
 * it recognises messages that should be routed to professionals and
 * blocks obviously unsafe advice in model output.
 */

export type SafetyCategory = "urgent" | "pain_or_injury" | "medical" | "extreme_diet";

export interface SafetyCheck {
  category: SafetyCategory;
  note: string;
}

const URGENT = /\b(chest pain|chest tightness|pain in (my )?chest|faint(ed|ing)?|pass(ed)? out|black(ed)? out|can'?t breathe|short(ness)? of breath|heart (is )?racing|irregular heartbeat|palpitations)\b/i;
const PAIN = /\b(injur(y|ed|ies)|sprain(ed)?|torn|tear|strain(ed)?|sharp pain|shooting pain|hurts?|painful|swollen|swelling|numb(ness)?|tingling|pop(ped)? in my)\b/i;
const MEDICAL = /\b(pregnan(t|cy)|postpartum|diabet(es|ic)|heart (condition|disease)|blood pressure|hypertension|asthma|surgery|medication|epilep(sy|tic)|hernia|osteoporosis|eating disorder|anorexi|bulimi)\b/i;
const EXTREME_DIET = /\b(starv(e|ing)|stop eating|not eat(ing)?|skip (all )?meals|(lose|drop) \d{2,} ?(kg|kilos|lbs|pounds) in (a|one|two|\d) (week|weeks|days?)|\b[1-9]\d{2} ?(k?cal|calories) (a|per) day)\b/i;

export function checkUserMessage(message: string): SafetyCheck | null {
  if (URGENT.test(message)) {
    return {
      category: "urgent",
      note:
        "Symptoms like chest pain, fainting, severe breathlessness or a racing/irregular heartbeat need medical attention. Stop exercising now and contact emergency services or a doctor right away.",
    };
  }
  if (EXTREME_DIET.test(message)) {
    return {
      category: "extreme_diet",
      note:
        "Very low intake or very fast weight loss can be harmful. A gradual approach is safer and easier to sustain — a registered dietitian or doctor can help set a target that's right for you.",
    };
  }
  if (PAIN.test(message)) {
    return {
      category: "pain_or_injury",
      note:
        "I can't assess pain or injuries. Avoid movements that hurt, and see a doctor or physiotherapist — especially for sharp pain, swelling, numbness, or pain that persists.",
    };
  }
  if (MEDICAL.test(message)) {
    return {
      category: "medical",
      note: "With a medical condition, pregnancy or medication, check with your doctor about what training is appropriate for you.",
    };
  }
  return null;
}

/** Daily intake suggestions below this are blocked in model output. */
const MIN_DAILY_KCAL = 1200;
const KCAL_PER_DAY = /\b(\d{3,4})\s?(k?cal(ories)?)\s?(a|per|each)\s?day\b|\b(\d{3,4})\s?(k?cal(ories)?)\s?daily\b/gi;
const DIAGNOSIS = /\b(you (have|likely have|probably have|might have|are suffering from)|this is (a|an) (tear|sprain|fracture|hernia|tendinitis|tendonitis))\b/i;
const CLAIMS_PROFESSIONAL = /\b(as (a|your) (doctor|physician|physiotherapist|physical therapist|dietitian|nutritionist|certified (personal )?trainer))\b/i;

/** Returns a reason when model output must not be shown. */
export function checkModelOutput(text: string): string | null {
  for (const m of text.matchAll(KCAL_PER_DAY)) {
    const n = Number(m[1] ?? m[5]);
    if (n > 0 && n < MIN_DAILY_KCAL) return "suggested an unsafe daily calorie intake";
  }
  if (DIAGNOSIS.test(text)) return "attempted a diagnosis";
  if (CLAIMS_PROFESSIONAL.test(text)) return "claimed to be a medical/health professional";
  return null;
}

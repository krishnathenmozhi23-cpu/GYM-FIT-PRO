import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { profileInputSchema, type Profile } from "@gymfit/shared";
import { Brand } from "../../components/Brand";
import { Alert, Button, ProgressBar } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../state/auth";
import {
  AboutStep,
  EquipmentStep,
  GoalStep,
  LevelStep,
  LimitationsStep,
  ScheduleStep,
  STEP_META,
  type Draft,
} from "./steps";

const DRAFT_KEY = "gymfit.onboardingDraft";

const DEFAULT_DRAFT: Draft = {
  name: "",
  age: 21,
  gender: "prefer_not_to_say",
  heightCm: 170,
  weightKg: 70,
  fitnessLevel: "beginner",
  goal: "general_fitness",
  targetWeightKg: null,
  location: "gym",
  equipment: ["full_gym"],
  daysPerWeek: 3,
  sessionMinutes: 45,
  preferredTime: "flexible",
  limitations: [],
  limitationNotes: "",
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...DEFAULT_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : DEFAULT_DRAFT;
  } catch {
    return DEFAULT_DRAFT;
  }
}

const STEPS = [AboutStep, LevelStep, GoalStep, EquipmentStep, ScheduleStep, LimitationsStep];

export function OnboardingPage() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable — draft just won't persist */
    }
  }, [draft]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const StepComponent = STEPS[step]!;
  const meta = STEP_META[step]!;
  const isLast = step === STEPS.length - 1;
  const canContinue = step !== 0 || (draft.name.trim().length > 0 && draft.heightCm > 0 && draft.weightKg > 0);

  async function finish() {
    setError(null);
    const parsed = profileInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your answers.");
      return;
    }
    setBusy(true);
    try {
      await api.post<{ profile: Profile }>("/profile", parsed.data);
      // Generating the first plan is best-effort here; the Workouts tab can retry.
      await api.post("/ai/workout-plan", {}).catch(() => undefined);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" style={{ paddingBottom: 32 }}>
      <div className="page">
        <div className="row-between">
          {step > 0 ? (
            <button className="icon-btn" aria-label="Back" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft size={20} />
            </button>
          ) : (
            <Brand />
          )}
          <span className="small muted">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <ProgressBar value={((step + 1) / STEPS.length) * 100} thin label="Onboarding progress" />
        <div className="stack-sm" style={{ marginTop: 8 }}>
          <h1 className="page-title">{meta.title}</h1>
          <p className="muted">{meta.subtitle}</p>
        </div>
        <div key={step} className="page" style={{ paddingTop: 4 }}>
          <StepComponent draft={draft} set={set} />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <Button
          block
          loading={busy}
          disabled={!canContinue}
          onClick={() => (isLast ? void finish() : setStep((s) => s + 1))}
        >
          {isLast ? "Build my plan" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

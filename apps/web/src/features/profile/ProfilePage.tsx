import { useState, type ComponentType } from "react";
import { ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import {
  EQUIPMENT_LABELS,
  GOAL_LABELS,
  LEVEL_LABELS,
  LIMITATION_LABELS,
  LOCATION_LABELS,
  TIME_LABELS,
  profileInputSchema,
  type AiStatus,
  type Profile,
} from "@gymfit/shared";
import { Alert, Button, ErrorState, LoadingState, Sheet } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useAuth } from "../../state/auth";
import { AccountSection } from "./AccountSection";
import { AboutStep, EquipmentStep, GoalStep, LevelStep, LimitationsStep, ScheduleStep, type Draft } from "../onboarding/steps";

type Section = { key: string; title: string; summary: (p: Profile) => string; Step: ComponentType<{ draft: Draft; set: (p: Partial<Draft>) => void }>; affectsPlan: boolean };

const SECTIONS: Section[] = [
  { key: "about", title: "About you", summary: (p) => `${p.age} yrs · ${p.heightCm} cm · ${p.weightKg} kg`, Step: AboutStep, affectsPlan: false },
  { key: "level", title: "Experience", summary: (p) => LEVEL_LABELS[p.fitnessLevel], Step: LevelStep, affectsPlan: true },
  { key: "goal", title: "Goal", summary: (p) => GOAL_LABELS[p.goal] + (p.targetWeightKg ? ` · target ${p.targetWeightKg} kg` : ""), Step: GoalStep, affectsPlan: true },
  { key: "equipment", title: "Location & equipment", summary: (p) => `${LOCATION_LABELS[p.location]} · ${p.equipment.map((e) => EQUIPMENT_LABELS[e]).join(", ")}`, Step: EquipmentStep, affectsPlan: true },
  { key: "schedule", title: "Schedule", summary: (p) => `${p.daysPerWeek} days · ${p.sessionMinutes} min · ${TIME_LABELS[p.preferredTime]}`, Step: ScheduleStep, affectsPlan: true },
  { key: "limits", title: "Limitations", summary: (p) => (p.limitations.length ? p.limitations.map((l) => LIMITATION_LABELS[l]).join(", ") : "None"), Step: LimitationsStep, affectsPlan: true },
];

function toDraft(p: Profile): Draft {
  const { userId: _u, email: _e, onboardingCompleted: _o, updatedAt: _t, ...rest } = p;
  return rest;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(() => api.get<{ profile: Profile }>("/profile"));
  const ai = useAsync(() => api.get<AiStatus>("/ai/status").catch(() => null));
  const [editing, setEditing] = useState<Section | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Couldn't load profile"} onRetry={reload} />;
  const profile = data.profile;

  function open(section: Section) {
    setDraft(toDraft(profile));
    setSaveError(null);
    setEditing(section);
  }

  async function save() {
    if (!draft || !editing) return;
    const parsed = profileInputSchema.safeParse(draft);
    if (!parsed.success) {
      setSaveError(parsed.error.issues[0]?.message ?? "Check your answers");
      return;
    }
    setBusy(true);
    try {
      const res = await api.put<{ profile: Profile }>("/profile", parsed.data);
      setData(res);
      if (editing.affectsPlan) {
        await api.post("/ai/workout-plan", {});
        setPlanNotice("Your plan was regenerated to match your updated profile. Logged weights carry over.");
      }
      setEditing(null);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
      </div>
      <div className="card row">
        <span className="brand-mark" style={{ width: 52, height: 52, fontSize: 22, fontWeight: 800 }}>{profile.name[0]?.toUpperCase()}</span>
        <div className="stack-sm grow">
          <span style={{ fontWeight: 800, fontSize: 18 }}>{profile.name}</span>
          <span className="small muted" style={{ overflowWrap: "anywhere" }}>{user?.email ?? "Guest account"}</span>
        </div>
      </div>
      {planNotice && <Alert kind="info">{planNotice}</Alert>}

      <div className="card">
        <div className="list">
          {SECTIONS.map((s) => (
            <button key={s.key} className="list-item" style={{ background: "none", border: "none", borderBottom: "1px solid var(--border)", textAlign: "left", cursor: "pointer", width: "100%" }} onClick={() => open(s)}>
              <div className="grow stack-sm">
                <span style={{ fontWeight: 700 }}>{s.title}</span>
                <span className="small muted">{s.summary(profile)}</span>
              </div>
              <ChevronRight size={18} color="var(--faint)" />
            </button>
          ))}
        </div>
      </div>

      <div className="card stack-sm">
        <div className="row">
          <ShieldCheck size={18} color="var(--accent)" />
          <h2 className="section-title">About GymFit Pro's guidance</h2>
        </div>
        <p className="small muted">
          GymFit Pro gives general fitness guidance. It is not a doctor, physiotherapist or dietitian and can't diagnose or treat
          anything. Stop if an exercise causes pain, and talk to a qualified professional about injuries, medical conditions or
          nutrition.
        </p>
        {ai.data && (
          <p className="small faint">
            AI provider: {ai.data.llmEnabled ? `${ai.data.provider} (${ai.data.model})` : ai.data.provider === "mock" ? "development mock (not real AI)" : "not configured — recommendations come from the built-in rule engine"}
          </p>
        )}
      </div>

      <AccountSection />

      <Button variant="secondary" onClick={() => (user?.isGuest ? setConfirmLogout(true) : void logout())}>
        <LogOut size={16} /> Log out
      </Button>

      <Sheet open={confirmLogout} onClose={() => setConfirmLogout(false)} title="Log out of a guest account?">
        <div className="stack">
          <Alert kind="warn">
            This account has no email or password, so after logging out you won't be able to get back to your plan and history.
            Save your account above first if you want to keep them.
          </Alert>
          <Button variant="danger" block onClick={() => void logout()}>
            Log out anyway
          </Button>
          <Button variant="secondary" block onClick={() => setConfirmLogout(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>

      {editing && draft && (
        <Sheet open onClose={() => setEditing(null)} title={editing.title} footer={<Button block loading={busy} onClick={() => void save()}>Save{editing.affectsPlan ? " & update plan" : ""}</Button>}>
          <div className="stack">
            <editing.Step draft={draft} set={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))} />
            {saveError && <Alert kind="error">{saveError}</Alert>}
          </div>
        </Sheet>
      )}
    </div>
  );
}

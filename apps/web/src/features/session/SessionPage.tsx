import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Camera, Check, ChevronLeft, ChevronRight, Pause, Play, PlayCircle, Plus, Repeat, ShieldAlert, SkipForward, Timer, Undo2, X } from "lucide-react";
import {
  formProfileFor,
  issueDef,
  MUSCLE_LABELS,
  type FormCheckView,
  type AdaptationChange,
  type CompleteSessionResponse,
  type ExerciseDetail,
  type Muscle,
  type SessionExerciseView,
  type SessionView,
} from "@gymfit/shared";
import { Alert, Button, ErrorState, LoadingState, ProgressBar, Sheet } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDuration, formatKg, formatReps } from "../../lib/format";
import { RestTimer } from "./RestTimer";
import { SessionSummary } from "./SessionSummary";
import { FormCheckCamera } from "../formcheck/FormCheckCamera";
import { LearnMovement } from "../formcheck/LearnMovement";
import { MovementDemo } from "../formcheck/MovementDemo";
import { cameraUnsupportedReason } from "../formcheck/coverage";

const RATINGS = [
  { value: 1, label: "Very easy" },
  { value: 2, label: "Easy" },
  { value: 3, label: "Just right" },
  { value: 4, label: "Hard" },
  { value: 5, label: "Too hard" },
];

function useNow(intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function elapsedSeconds(s: SessionView, now: number): number {
  if (s.durationSeconds !== null) return s.durationSeconds;
  const pausedNow = s.pausedAt ? (now - Date.parse(s.pausedAt)) / 1000 : 0;
  return (now - Date.parse(s.startedAt)) / 1000 - s.pausedSeconds - pausedNow;
}

function firstPendingIndex(s: SessionView): number {
  const idx = s.exercises.findIndex((e) => e.status === "pending");
  return idx === -1 ? Math.max(0, s.exercises.length - 1) : idx;
}

export default function SessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [exerciseStart, setExerciseStart] = useState(() => Date.now());
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [result, setResult] = useState<{ adaptations: AdaptationChange[] } | null>(null);
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const { session } = await api.get<{ session: SessionView }>(`/workout-session/${id}`);
      setSession(session);
      setCurrent(firstPendingIndex(session));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setExerciseStart(Date.now()), [current]);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setActionError(null);
    try {
      return await fn();
    } catch (err) {
      setActionError(errorMessage(err));
      return undefined;
    }
  }, []);

  const doneCount = useMemo(() => session?.exercises.filter((e) => e.status !== "pending").length ?? 0, [session]);

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!session) return <LoadingState label="Loading workout…" />;
  if (session.status === "completed") {
    return <SessionSummary session={session} adaptations={result?.adaptations ?? null} />;
  }
  if (session.status === "abandoned") {
    return (
      <div className="page">
        <ErrorState message="This workout was ended early." />
        <Button onClick={() => navigate("/")}>Back home</Button>
      </div>
    );
  }

  const ex = session.exercises[current]!;
  const paused = session.pausedAt !== null;
  const elapsed = elapsedSeconds(session, now);
  const progress = (doneCount / session.exercises.length) * 100;

  async function patchExercise(body: object) {
    const res = await run(() => api.patch<{ session: SessionView }>(`/workout-session/${session!.id}/exercise/${ex.id}`, body));
    if (res) setSession(res.session);
    return res?.session;
  }

  function goToNextPending(s: SessionView) {
    const next = s.exercises.findIndex((e, i) => i > current && e.status === "pending");
    const any = s.exercises.findIndex((e) => e.status === "pending");
    if (next !== -1) setCurrent(next);
    else if (any !== -1) setCurrent(any);
    else setFinishOpen(true);
  }

  async function logSet(values: { reps: number | null; weightKg: number | null; durationSeconds: number | null }) {
    const res = await run(() =>
      api.post<{ set: SessionExerciseView["sets"][number] }>(`/workout-session/${session!.id}/set`, {
        sessionExerciseId: ex.id,
        ...values,
      }),
    );
    if (!res) return;
    const sets = [...ex.sets, res.set];
    let updated: SessionView = {
      ...session!,
      exercises: session!.exercises.map((e) => (e.id === ex.id ? { ...e, sets, status: "pending" } : e)),
    };
    setSession(updated);
    if (sets.length >= ex.prescription.sets) {
      const completed = await patchExercise({ action: "complete" });
      if (completed) updated = completed;
      goToNextPending(updated);
    }
    if (ex.prescription.restSeconds > 0) {
      setRest({ endsAt: Date.now() + ex.prescription.restSeconds * 1000, total: ex.prescription.restSeconds });
    }
  }

  async function undoSet(setId: string) {
    await run(() => api.del(`/workout-session/${session!.id}/set/${setId}`));
    await load();
  }

  async function togglePause() {
    const res = await run(() => api.post<{ session: SessionView }>(`/workout-session/${session!.id}/pause`, { paused: !paused }));
    if (res) setSession(res.session);
  }

  async function skip() {
    const s = await patchExercise({ action: "skip" });
    if (s) goToNextPending(s);
  }

  async function finish(difficultyRating: number, feedback: string) {
    const res = await run(() =>
      api.post<CompleteSessionResponse>(`/workout-session/${session!.id}/complete`, { difficultyRating, feedback }),
    );
    if (res) {
      setResult({ adaptations: res.adaptations });
      setSession(res.session);
      setFinishOpen(false);
    }
  }

  async function endWorkout() {
    const ok = await run(async () => {
      await api.post(`/workout-session/${session!.id}/abandon`);
      return true;
    });
    if (ok) navigate("/", { replace: true });
  }

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      <div className="page-header">
        <button className="icon-btn" aria-label="Leave workout screen" onClick={() => navigate("/")}>
          <ChevronLeft size={20} />
        </button>
        <div className="stack-sm" style={{ alignItems: "center" }}>
          <span className="eyebrow">{session.title}</span>
          <span className="timer" style={{ fontSize: 22 }} aria-label="Workout time">
            {formatDuration(elapsed)}
          </span>
        </div>
        <button className="icon-btn" aria-label={paused ? "Resume workout" : "Pause workout"} onClick={() => void togglePause()}>
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      </div>
      <ProgressBar value={progress} thin label="Workout progress" />
      {paused && <Alert kind="warn">Workout paused — the timer is stopped.</Alert>}
      {actionError && <Alert kind="error">{actionError}</Alert>}

      <div className="scroll-x" role="tablist" aria-label="Exercises">
        {session.exercises.map((e, i) => (
          <button
            key={e.id}
            role="tab"
            aria-selected={i === current}
            className="chip"
            aria-pressed={i === current}
            onClick={() => setCurrent(i)}
            style={{ opacity: e.status === "skipped" ? 0.5 : 1 }}
          >
            {e.status === "completed" ? <Check size={14} /> : `${i + 1}`} {e.exerciseName.split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
      </div>

      <ExerciseCard
        key={ex.id}
        ex={ex}
        exerciseElapsed={(now - exerciseStart) / 1000}
        disabled={paused}
        onLog={logSet}
        onUndo={undoSet}
        onFormCheck={async (result) => {
          const res = await api.post<{ formCheck: FormCheckView }>(`/workout-session/${session.id}/form-check`, { sessionExerciseId: ex.id, ...result });
          setSession((s) =>
            s && { ...s, exercises: s.exercises.map((e) => (e.id === ex.id ? { ...e, formChecks: [...e.formChecks, res.formCheck] } : e)) },
          );
        }}
      />

      <div className="grid-3">
        <Button variant="secondary" small onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
          <ChevronLeft size={16} /> Prev
        </Button>
        <Button variant="secondary" small onClick={() => setReplaceOpen(true)} disabled={ex.sets.length > 0}>
          <Repeat size={16} /> Replace
        </Button>
        <Button variant="secondary" small onClick={() => void skip()} disabled={ex.status === "skipped"}>
          <SkipForward size={16} /> Skip
        </Button>
      </div>
      {current < session.exercises.length - 1 && (
        <Button variant="ghost" small onClick={() => setCurrent((c) => c + 1)}>
          Next exercise <ChevronRight size={16} />
        </Button>
      )}

      <div className="divider" />
      <Button block onClick={() => setFinishOpen(true)}>
        <Check size={18} /> Finish workout
      </Button>
      <Button variant="danger" small onClick={() => setEndOpen(true)}>
        End without saving
      </Button>

      {rest && <RestTimer endsAt={rest.endsAt} total={rest.total} onDone={() => setRest(null)} onAdd={(s) => setRest((r) => r && { endsAt: r.endsAt + s * 1000, total: r.total + s })} />}

      <ReplaceSheet open={replaceOpen} onClose={() => setReplaceOpen(false)} exerciseId={ex.exerciseId} onPick={async (newId) => {
        const s = await patchExercise({ action: "replace", exerciseId: newId });
        if (s) setReplaceOpen(false);
      }} />

      <FinishSheet open={finishOpen} onClose={() => setFinishOpen(false)} onSubmit={finish} pending={session.exercises.filter((e) => e.status === "pending").length} />

      <Sheet open={endOpen} onClose={() => setEndOpen(false)} title="End this workout?">
        <div className="stack">
          <p className="muted">Logged sets will be discarded from your progress and the plan won't adapt from this session.</p>
          <Button variant="danger" block onClick={() => void endWorkout()}>
            End workout
          </Button>
          <Button variant="secondary" block onClick={() => setEndOpen(false)}>
            Keep going
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function ExerciseCard({
  ex,
  exerciseElapsed,
  disabled,
  onLog,
  onUndo,
  onFormCheck,
}: {
  ex: SessionExerciseView;
  exerciseElapsed: number;
  disabled: boolean;
  onLog: (v: { reps: number | null; weightKg: number | null; durationSeconds: number | null }) => Promise<void>;
  onUndo: (setId: string) => Promise<void>;
  onFormCheck: (result: Omit<import("@gymfit/shared").FormCheckResult, "sessionExerciseId">) => Promise<void>;
}) {
  const formProfile = formProfileFor(ex.exerciseId);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const lastCheck = ex.formChecks[ex.formChecks.length - 1];
  const p = ex.prescription;
  const last = ex.sets[ex.sets.length - 1];
  const timed = ex.measure === "time";
  const [weight, setWeight] = useState<string>(String(last?.weightKg ?? p.targetWeightKg ?? ""));
  const [reps, setReps] = useState<string>(String(last?.reps ?? p.repsMax));
  const [duration, setDuration] = useState<string>(String(last?.durationSeconds ?? p.durationSeconds ?? 30));
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const remainingRows = Math.max(0, p.sets - ex.sets.length);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      navigator.vibrate?.(200);
      void submit();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  async function submit() {
    setBusy(true);
    await onLog({
      reps: timed ? null : Number(reps) || 0,
      weightKg: ex.loaded && weight !== "" ? Number(weight) : null,
      durationSeconds: timed ? Number(duration) || 0 : null,
    });
    setBusy(false);
  }

  const target = timed ? `${p.sets} × ${p.durationSeconds}s` : `${p.sets} × ${formatReps(p.repsMin, p.repsMax)} reps`;

  return (
    <div className="card stack">
      <div className="row-between">
        <div className="stack-sm grow">
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>{ex.exerciseName}</h2>
          <span className="small muted">
            {ex.primaryMuscles.map((m) => MUSCLE_LABELS[m as Muscle] ?? m).join(", ")}
            {ex.replacedFromName ? ` · replaces ${ex.replacedFromName}` : ""}
          </span>
        </div>
        <span className="badge" aria-label="Time on this exercise">
          <Timer size={12} /> {formatDuration(exerciseElapsed)}
        </span>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="badge badge-accent">{target}</span>
        <span className="badge">Rest {p.restSeconds}s</span>
        {ex.loaded && <span className="badge badge-blue">Target {p.targetWeightKg !== null ? formatKg(p.targetWeightKg) : "— calibrate"}</span>}
        {ex.status === "skipped" && <span className="badge badge-orange">Skipped</span>}
      </div>

      <MovementDemo exercise={{ id: ex.exerciseId, name: ex.exerciseName, videoUrl: ex.videoUrl }} />

      <div className="stack-sm">
        <div className="set-row small faint" aria-hidden>
          <span>Set</span>
          <span style={{ textAlign: "center" }}>{ex.loaded ? "kg" : ""}</span>
          <span style={{ textAlign: "center" }}>{timed ? "sec" : "reps"}</span>
          <span />
        </div>
        {ex.sets.map((s) => (
          <div className="set-row" key={s.id}>
            <span className="index-dot">{s.setNumber}</span>
            <span style={{ textAlign: "center", fontWeight: 700 }}>{ex.loaded ? (s.weightKg ?? "—") : ""}</span>
            <span style={{ textAlign: "center", fontWeight: 700 }}>{timed ? `${s.durationSeconds}s` : s.reps}</span>
            <button className="set-done" data-done="true" aria-label={`Undo set ${s.setNumber}`} onClick={() => void onUndo(s.id)}>
              <Undo2 size={16} />
            </button>
          </div>
        ))}
        {(
          <div className="set-row">
            <span className="index-dot" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              {ex.sets.length + 1}
            </span>
            {ex.loaded ? (
              <input
                className="input"
                inputMode="decimal"
                type="number"
                step="0.5"
                min={0}
                aria-label="Weight in kg"
                placeholder="kg"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            ) : (
              <span />
            )}
            {timed ? (
              <input className="input" inputMode="numeric" type="number" min={0} aria-label="Seconds" value={duration} onChange={(e) => setDuration(e.target.value)} />
            ) : (
              <input className="input" inputMode="numeric" type="number" min={0} aria-label="Reps" value={reps} onChange={(e) => setReps(e.target.value)} />
            )}
            <button className="set-done" aria-label="Log set" disabled={busy || disabled} onClick={() => void submit()}>
              {remainingRows === 0 ? <Plus size={18} /> : <Check size={18} />}
            </button>
          </div>
        )}
        {remainingRows > 1 && <span className="small faint">{remainingRows - 1} more set{remainingRows - 1 === 1 ? "" : "s"} after this one</span>}
        {remainingRows === 0 && <span className="small faint">Target sets done — tap + to log an extra set.</span>}
      </div>

      {timed && (
        <Button variant="secondary" disabled={disabled || countdown !== null} onClick={() => setCountdown(Number(duration) || 30)}>
          <Timer size={16} /> {countdown !== null ? `${countdown}s — keep going` : `Start ${duration}s timer`}
        </Button>
      )}

      {formProfile ? (
        <Button block onClick={() => setCameraOpen(true)} disabled={disabled}>
          <Camera size={18} /> Check my form
        </Button>
      ) : (
        <p className="small faint">
          <Camera size={14} style={{ verticalAlign: "-2px" }} /> No camera form check for this exercise — {cameraUnsupportedReason(ex.exerciseId)}
        </p>
      )}
      <Button variant="secondary" small onClick={() => setLearnOpen(true)}>
        <PlayCircle size={16} /> Watch how
      </Button>
      {cameraNote && <Alert kind="info">{cameraNote}</Alert>}
      {lastCheck && (
        <div className="small row wrap" style={{ gap: 6 }} aria-label="Last form check">
          {lastCheck.issues.some((i) => i.severity === "risk") && <ShieldAlert size={14} color="var(--danger)" />}
          <span className="muted">
            Last camera check: {formProfile?.mode === "hold" ? `${lastCheck.durationSeconds}s held` : `${lastCheck.cleanReps}/${lastCheck.reps} clean reps`}
          </span>
          {lastCheck.issues.map((i) => (
            <span key={i.code} className={`badge ${i.severity === "risk" ? "badge-danger" : i.severity === "form" ? "badge-orange" : ""}`}>
              {issueDef(lastCheck.profile, i.code)?.label ?? i.code} ×{i.count}
            </span>
          ))}
        </div>
      )}

      <Sheet open={learnOpen} onClose={() => setLearnOpen(false)} title={`How to: ${ex.exerciseName}`}>
        <LearnMovement exercise={{ id: ex.exerciseId, name: ex.exerciseName, videoUrl: ex.videoUrl }} />
      </Sheet>

      {cameraOpen && formProfile && (
        <FormCheckCamera
          profile={formProfile}
          exerciseName={ex.exerciseName}
          onClose={() => setCameraOpen(false)}
          onSave={async (result) => {
            await onFormCheck(result);
            if (formProfile.mode === "hold" && result.durationSeconds > 0) {
              setDuration(String(result.durationSeconds));
              setCameraNote(`Camera timed ${result.durationSeconds}s — check it and tap ✓ to log the set.`);
            } else if (result.reps > 0) {
              setReps(String(result.reps));
              setCameraNote(`Camera counted ${result.reps} reps — check the number and tap ✓ to log the set.`);
            }
          }}
        />
      )}
    </div>
  );
}

function ReplaceSheet({ open, onClose, exerciseId, onPick }: { open: boolean; onClose: () => void; exerciseId: string; onPick: (id: string) => Promise<void> }) {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setError(null);
    api.get<{ exercise: ExerciseDetail }>(`/exercises/${exerciseId}`).then((r) => setDetail(r.exercise), (e) => setError(errorMessage(e)));
  }, [open, exerciseId]);

  return (
    <Sheet open={open} onClose={onClose} title="Replace exercise">
      {error && <Alert kind="error">{error}</Alert>}
      {!detail && !error && <LoadingState label="Finding alternatives…" />}
      {detail && (
        <div className="list">
          {detail.alternatives.length === 0 && <p className="muted">No suitable alternatives found.</p>}
          {detail.alternatives.map((a) => (
            <button key={a.exercise.id} className="list-item" style={{ background: "none", border: "none", borderBottom: "1px solid var(--border)", textAlign: "left", cursor: "pointer" }} onClick={() => void onPick(a.exercise.id)}>
              <div className="grow stack-sm">
                <span style={{ fontWeight: 700 }}>{a.exercise.name}</span>
                <span className="small muted">{a.reason}</span>
              </div>
              {a.available ? <span className="badge badge-accent">Available</span> : <span className="badge">Needs equipment</span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function FinishSheet({ open, onClose, onSubmit, pending }: { open: boolean; onClose: () => void; onSubmit: (rating: number, feedback: string) => Promise<void>; pending: number }) {
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="How did that feel?">
      <div className="stack">
        {pending > 0 && <Alert kind="info">{pending} exercise{pending === 1 ? "" : "s"} not logged will be marked as skipped.</Alert>}
        <div className="chips" role="radiogroup" aria-label="Difficulty">
          {RATINGS.map((r) => (
            <button key={r.value} type="button" role="radio" aria-checked={rating === r.value} className="chip" aria-pressed={rating === r.value} onClick={() => setRating(r.value)}>
              {r.value} · {r.label}
            </button>
          ))}
        </div>
        <textarea className="textarea" placeholder="Any notes? (optional) e.g. shoulder felt tight on presses" maxLength={1000} value={feedback} onChange={(e) => setFeedback(e.target.value)} aria-label="Workout notes" />
        <p className="small faint">Your rating and logged sets are used to adjust your next workouts.</p>
        <Button block disabled={rating === null} loading={busy} onClick={async () => {
          setBusy(true);
          await onSubmit(rating!, feedback);
          setBusy(false);
        }}>
          Save workout
        </Button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={14} /> Not yet
        </button>
      </div>
    </Sheet>
  );
}

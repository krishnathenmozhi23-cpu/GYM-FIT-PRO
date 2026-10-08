import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Clock, Play } from "lucide-react";
import type { DailyWorkoutRequest, DailyWorkoutResponse, SessionView } from "@gymfit/shared";
import { Alert, Button, LoadingState, Sheet, SourceBadge } from "../../components/ui";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatKg, formatReps } from "../../lib/format";

/** Generates a time-boxed / focused workout and lets the user start it. */
export function QuickWorkoutSheet({ request, onClose }: { request: DailyWorkoutRequest; onClose: () => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<DailyWorkoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.post<DailyWorkoutResponse>("/ai/daily-workout", request).then(setData, (e) => setError(errorMessage(e)));
  }, [request]);

  async function start() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const { session } = await api.post<{ session: SessionView }>("/workout-session", {
        title: data.workout.title,
        workoutId: data.basedOnWorkoutId,
        exercises: data.workout.exercises.map(({ exerciseName: _n, ...e }) => e),
      });
      navigate(`/session/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "Finish or end your current workout first." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={data?.workout.title ?? "Building your workout…"} footer={data && <Button block loading={busy} onClick={() => void start()}><Play size={18} /> Start this workout</Button>}>
      {error && <Alert kind="error">{error}</Alert>}
      {!data && !error && <LoadingState label="Fitting a workout to your time…" />}
      {data && (
        <div className="stack">
          <div className="row-between">
            <span className="row small muted" style={{ gap: 4 }}>
              <Clock size={15} /> ~{data.workout.estimatedMinutes} min · {data.workout.exercises.length} exercises
            </span>
            <SourceBadge source={data.meta.source} />
          </div>
          {data.meta.fallbackReason && <Alert kind="info">{data.meta.fallbackReason}</Alert>}
          <div className="list">
            {data.workout.exercises.map((e, i) => (
              <div className="list-item" key={e.exerciseId}>
                <span className="index-dot">{i + 1}</span>
                <div className="grow stack-sm">
                  <span style={{ fontWeight: 700 }}>{e.exerciseName}</span>
                  <span className="small muted">
                    {e.durationSeconds ? `${e.sets} × ${e.durationSeconds}s` : `${e.sets} × ${formatReps(e.repsMin, e.repsMax)}`} · Rest {e.restSeconds}s
                    {e.targetWeightKg !== null ? ` · ${formatKg(e.targetWeightKg)}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

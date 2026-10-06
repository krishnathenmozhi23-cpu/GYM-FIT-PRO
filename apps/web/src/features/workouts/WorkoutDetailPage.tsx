import { useParams, useNavigate } from "react-router";
import { ChevronLeft, Clock, Dumbbell, Play } from "lucide-react";
import type { WorkoutView } from "@gymfit/shared";
import { Alert, Button, ErrorState, LoadingState } from "../../components/ui";
import { ExerciseRow } from "../../components/ExerciseRow";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useStartWorkout } from "./useStartWorkout";
import { QuickAdjust } from "./QuickAdjust";

export default function WorkoutDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get<{ workout: WorkoutView }>(`/workouts/${id}`), [id]);
  const { start, busy, error: startError } = useStartWorkout();

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Workout not found"} onRetry={reload} />;
  const w = data.workout;

  return (
    <div className="page">
      <div className="page-header">
        <button className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </button>
      </div>
      <div className="stack-sm">
        <span className="eyebrow">Workout</span>
        <h1 className="page-title">{w.title}</h1>
        <div className="row small muted" style={{ gap: 14 }}>
          <span className="row" style={{ gap: 4 }}>
            <Clock size={15} /> ~{w.estimatedMinutes} min
          </span>
          <span className="row" style={{ gap: 4 }}>
            <Dumbbell size={15} /> {w.exercises.length} exercises
          </span>
        </div>
      </div>
      {startError && <Alert kind="error">{startError}</Alert>}
      <Button block loading={busy} onClick={() => void start(w.id)}>
        <Play size={18} /> Start workout
      </Button>
      <QuickAdjust workout={w} />
      <div className="card">
        <div className="list">
          {w.exercises.map((e, i) => (
            <ExerciseRow key={e.id} e={e} index={i} />
          ))}
        </div>
      </div>
      <p className="small faint">Includes a 5-minute warm-up in the time estimate. Tap an exercise for instructions.</p>
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, ListChecks, PlayCircle } from "lucide-react";
import {
  EXERCISE_EQUIPMENT_LABELS,
  LEVEL_LABELS,
  LIMITATION_LABELS,
  MUSCLE_LABELS,
  PATTERN_LABELS,
  formProfileFor,
  type ExerciseDetail,
} from "@gymfit/shared";
import { Button, ErrorState, LoadingState } from "../../components/ui";
import { FormCheckCamera } from "../formcheck/FormCheckCamera";
import { LearnMovement } from "../formcheck/LearnMovement";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";

export default function ExerciseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get<{ exercise: ExerciseDetail }>(`/exercises/${id}`), [id]);
  const [practice, setPractice] = useState(false);
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Exercise not found"} onRetry={reload} />;
  const e = data.exercise;

  return (
    <div className="page">
      <div className="page-header">
        <button className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </button>
      </div>
      <div className="stack-sm">
        <span className="eyebrow">{PATTERN_LABELS[e.pattern]}</span>
        <h1 className="page-title">{e.name}</h1>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className={`badge ${e.difficulty === "beginner" ? "badge-accent" : e.difficulty === "intermediate" ? "badge-blue" : "badge-orange"}`}>
            {LEVEL_LABELS[e.difficulty]}
          </span>
          {e.equipment.map((x) => (
            <span key={x} className="badge">
              {EXERCISE_EQUIPMENT_LABELS[x]}
            </span>
          ))}
          <span className="badge">{e.mechanics === "compound" ? "Compound" : "Isolation"}</span>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <PlayCircle size={18} color="var(--accent)" />
          <h2 className="section-title">Learn the movement</h2>
        </div>
        <LearnMovement exercise={e} />
        {formProfileFor(e.id) ? (
          <Button variant="secondary" onClick={() => setPractice(true)}>
            <Camera size={16} /> Practice with camera form check
          </Button>
        ) : (
          <p className="small faint">Camera form check isn't available for this exercise yet.</p>
        )}
      </div>

      {practice && formProfileFor(e.id) && (
        <FormCheckCamera profile={formProfileFor(e.id)!} exerciseName={e.name} onClose={() => setPractice(false)} />
      )}

      <div className="card stack-sm">
        <span className="eyebrow">Target</span>
        <p style={{ fontWeight: 700 }}>{e.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}</p>
        {e.secondaryMuscles.length > 0 && <p className="small muted">Also works: {e.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}</p>}
      </div>

      <div className="card stack">
        <div className="row">
          <ListChecks size={18} color="var(--accent)" />
          <h2 className="section-title">How to do it</h2>
        </div>
        <ol className="stack-sm" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
          {e.instructions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="card stack">
        <div className="row">
          <AlertTriangle size={18} color="var(--orange)" />
          <h2 className="section-title">Common mistakes</h2>
        </div>
        <ul className="stack-sm" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
          {e.commonMistakes.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {e.contraindications.length > 0 && (
          <p className="small faint">Not recommended if you selected: {e.contraindications.map((c) => LIMITATION_LABELS[c].toLowerCase()).join("; ")}.</p>
        )}
      </div>

      <div className="card stack-sm">
        <h2 className="section-title">Alternatives</h2>
        <p className="small muted">Ranked for your equipment and limitations.</p>
        <div className="list">
          {e.alternatives.length === 0 && <p className="muted small">No alternatives found.</p>}
          {e.alternatives.map((a) => (
            <Link key={a.exercise.id} to={`/explore/${a.exercise.id}`} className="list-item">
              <div className="grow stack-sm">
                <span style={{ fontWeight: 700 }}>{a.exercise.name}</span>
                <span className="small muted">{a.reason}</span>
              </div>
              {a.available ? <span className="badge badge-accent">Available</span> : <span className="badge">Needs gear</span>}
              <ChevronRight size={18} color="var(--faint)" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

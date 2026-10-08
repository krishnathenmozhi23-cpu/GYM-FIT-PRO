import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowDownRight, ArrowUpRight, Minus, Trophy } from "lucide-react";
import type { AdaptationChange, SessionView } from "@gymfit/shared";
import { Button } from "../../components/ui";
import { formatDuration } from "../../lib/format";

const ICON: Record<AdaptationChange["kind"], ReactNode> = {
  increase_load: <ArrowUpRight size={16} color="var(--accent)" />,
  increase_reps: <ArrowUpRight size={16} color="var(--accent)" />,
  increase_volume: <ArrowUpRight size={16} color="var(--accent)" />,
  maintain: <Minus size={16} color="var(--muted)" />,
  reduce_load: <ArrowDownRight size={16} color="var(--orange)" />,
  reduce_volume: <ArrowDownRight size={16} color="var(--orange)" />,
};

export function SessionSummary({ session, adaptations }: { session: SessionView; adaptations: AdaptationChange[] | null }) {
  const navigate = useNavigate();
  const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = session.exercises.reduce((v, e) => v + e.sets.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0), 0);
  const completed = session.exercises.filter((e) => e.status === "completed").length;
  return (
    <div className="page">
      <div className="card card-hero stack" style={{ alignItems: "flex-start" }}>
        <span className="option-icon" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
          <Trophy size={20} />
        </span>
        <h1 className="page-title">Workout complete</h1>
        <p className="muted">{session.title}</p>
        <div className="grid-3" style={{ width: "100%" }}>
          <div>
            <div className="stat-value">{formatDuration(session.durationSeconds ?? 0)}</div>
            <div className="stat-label">Duration</div>
          </div>
          <div>
            <div className="stat-value">{sets}</div>
            <div className="stat-label">Sets</div>
          </div>
          <div>
            <div className="stat-value">{Math.round(volume)}</div>
            <div className="stat-label">kg volume</div>
          </div>
        </div>
        <span className="small muted">
          {completed} of {session.exercises.length} exercises completed
        </span>
      </div>

      {adaptations && adaptations.length > 0 && (
        <div className="card stack">
          <h2 className="section-title">Your next workouts</h2>
          <p className="small muted">Based on what you logged today:</p>
          <div className="list">
            {adaptations.map((a) => (
              <div className="list-item" key={a.exerciseId + a.kind}>
                {ICON[a.kind]}
                <div className="grow stack-sm">
                  <span style={{ fontWeight: 700 }}>
                    {a.exerciseName}: {a.from} → {a.to}
                  </span>
                  <span className="small muted">{a.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Button block onClick={() => navigate("/", { replace: true })}>
        Done
      </Button>
    </div>
  );
}

import { Link } from "react-router";
import { CheckCircle2, Clock, Dumbbell, Moon, Play } from "lucide-react";
import type { TodayResponse } from "@gymfit/shared";
import { Alert, Button } from "../../components/ui";
import { useStartWorkout } from "../workouts/useStartWorkout";

export function TodayCard({ today }: { today: TodayResponse }) {
  const { start, busy, error } = useStartWorkout();
  const w = today.workout;

  if (today.activeSessionId) {
    return (
      <div className="card card-hero stack">
        <span className="eyebrow">In progress</span>
        <h2 className="page-title" style={{ fontSize: 26 }}>Workout in progress</h2>
        <Link to={`/session/${today.activeSessionId}`} className="btn btn-primary btn-block">
          <Play size={18} /> Resume workout
        </Link>
      </div>
    );
  }

  if (!w) {
    return (
      <div className="card stack">
        <span className="eyebrow">Today</span>
        <p className="muted">No plan yet. Head to Workouts to generate one.</p>
        <Link to="/workouts" className="btn btn-primary">Go to Workouts</Link>
      </div>
    );
  }

  if (today.completedToday) {
    return (
      <div className="card card-hero stack">
        <span className="eyebrow">Today</span>
        <div className="row">
          <CheckCircle2 size={22} color="var(--accent)" />
          <h2 className="section-title">Today's workout is done. Nice work.</h2>
        </div>
        <p className="small muted">Recovery is part of training. Next up: {w.title}.</p>
      </div>
    );
  }

  return (
    <div className="card card-hero stack">
      <div className="row-between">
        <span className="eyebrow">{today.isRestDay ? "Rest day" : "Today's goal"}</span>
        {today.isRestDay && (
          <span className="badge">
            <Moon size={12} /> Recovery
          </span>
        )}
      </div>
      <h2 className="page-title" style={{ fontSize: 30 }}>
        {today.isRestDay ? `Next up: ${w.title}` : w.title}
      </h2>
      <div className="row small muted" style={{ gap: 16 }}>
        <span className="row" style={{ gap: 4 }}>
          <Clock size={15} /> {w.estimatedMinutes} min
        </span>
        <span className="row" style={{ gap: 4 }}>
          <Dumbbell size={15} /> {w.exercises.length} exercises
        </span>
      </div>
      {today.isRestDay && <p className="small muted">Today is scheduled for rest. You can still train if you feel recovered.</p>}
      {error && <Alert kind="error">{error}</Alert>}
      <div className="row">
        <Button className="grow" loading={busy} onClick={() => void start(w.id)} variant={today.isRestDay ? "secondary" : "primary"}>
          <Play size={18} /> {today.isRestDay ? "Train anyway" : "Start workout"}
        </Button>
        <Link to={`/workout/${w.id}`} className="btn btn-secondary">
          Details
        </Link>
      </div>
    </div>
  );
}

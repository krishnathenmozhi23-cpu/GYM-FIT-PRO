import { Link } from "react-router";
import { CalendarDays, ChevronRight, History, RefreshCw } from "lucide-react";
import type { PlanView, SessionSummary, TodayResponse } from "@gymfit/shared";
import { useState } from "react";
import { Alert, Button, EmptyState, ErrorState, SkeletonBlock, SourceBadge } from "../../components/ui";
import { WeekStrip } from "../../components/WeekStrip";
import { api, errorMessage } from "../../lib/api";
import { DAY_NAMES_LONG, formatDuration, shortDate } from "../../lib/format";
import { useAsync } from "../../lib/useAsync";

export default function WorkoutsPage() {
  const plan = useAsync(() => api.get<{ plan: PlanView | null }>("/workouts/plan"));
  const today = useAsync(() => api.get<TodayResponse>("/workouts/today"));
  const history = useAsync(() => api.get<{ sessions: SessionSummary[] }>("/workout-session"));
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  async function regenerate() {
    setRegenerating(true);
    setRegenError(null);
    try {
      await api.post("/workouts/plan", {});
      await Promise.all([plan.reload(), today.reload()]);
    } catch (err) {
      setRegenError(errorMessage(err));
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Workouts</h1>
      </div>

      {plan.loading ? (
        <SkeletonBlock height={220} />
      ) : plan.error ? (
        <ErrorState message={plan.error} onRetry={plan.reload} />
      ) : !plan.data?.plan ? (
        <div className="card">
          <EmptyState
            icon={<CalendarDays size={28} />}
            title="No plan yet"
            message="Generate a weekly plan based on your profile."
            action={<Button loading={regenerating} onClick={() => void regenerate()}>Generate my plan</Button>}
          />
          {regenError && <Alert kind="error">{regenError}</Alert>}
        </div>
      ) : (
        <>
          <div className="card stack">
            <div className="row-between">
              <div className="stack-sm grow">
                <span className="eyebrow">Current plan</span>
                <h2 className="section-title">{plan.data.plan.name}</h2>
              </div>
              <SourceBadge source={plan.data.plan.source} />
            </div>
            <p className="small muted">{plan.data.plan.rationale}</p>
            {today.data?.schedule && (
              <>
                <WeekStrip schedule={today.data.schedule} />
                {today.data.schedule.notes.map((n) => (
                  <Alert key={n} kind="info">
                    {n}
                  </Alert>
                ))}
              </>
            )}
          </div>

          <div className="stack-sm">
            {plan.data.plan.workouts.map((w) => (
              <Link key={w.id} to={`/workout/${w.id}`} className="card card-tight card-link row">
                <span className="index-dot">{DAY_NAMES_LONG[w.dayOfWeek]!.slice(0, 3)}</span>
                <div className="grow stack-sm">
                  <span style={{ fontWeight: 700 }}>{w.title}</span>
                  <span className="small muted">
                    {w.exercises.length} exercises · ~{w.estimatedMinutes} min · {w.focus.join(", ")}
                  </span>
                </div>
                <ChevronRight size={18} color="var(--faint)" />
              </Link>
            ))}
          </div>

          {regenError && <Alert kind="error">{regenError}</Alert>}
          <Button variant="secondary" loading={regenerating} onClick={() => void regenerate()}>
            <RefreshCw size={16} /> Regenerate plan
          </Button>
          <p className="small faint" style={{ textAlign: "center" }}>
            Regenerating keeps your logged weights so suggested loads carry over.
          </p>
        </>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <History size={18} />
        <h2 className="section-title">History</h2>
      </div>
      {history.loading ? (
        <SkeletonBlock height={100} />
      ) : history.error ? (
        <ErrorState message={history.error} onRetry={history.reload} />
      ) : !history.data?.sessions.length ? (
        <div className="card">
          <EmptyState title="No workouts logged yet" message="Completed workouts will appear here." />
        </div>
      ) : (
        <div className="card">
          <div className="list">
            {history.data.sessions.map((s) => (
              <Link key={s.id} to={`/session/${s.id}`} className="list-item">
                <div className="grow stack-sm">
                  <span style={{ fontWeight: 700 }}>{s.title}</span>
                  <span className="small muted">
                    {shortDate(s.completedAt ?? s.startedAt)} · {formatDuration(s.durationSeconds ?? 0)} · {s.setsCompleted} sets
                    {s.volumeKg ? ` · ${s.volumeKg} kg` : ""}
                  </span>
                </div>
                <ChevronRight size={18} color="var(--faint)" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

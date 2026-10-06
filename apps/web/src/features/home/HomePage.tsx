import { Flame } from "lucide-react";
import type { Profile, ProgressOverview, TodayResponse } from "@gymfit/shared";
import { ErrorState, ProgressBar, SkeletonBlock } from "../../components/ui";
import { WeekStrip } from "../../components/WeekStrip";
import { api } from "../../lib/api";
import { greeting } from "../../lib/format";
import { useAsync } from "../../lib/useAsync";
import { TodayCard } from "./TodayCard";
import { InsightCard } from "./InsightCard";

export default function HomePage() {
  const profile = useAsync(() => api.get<{ profile: Profile }>("/profile"));
  const today = useAsync(() => api.get<TodayResponse>("/workouts/today"));
  const progress = useAsync(() => api.get<{ progress: ProgressOverview }>("/progress"));
  const streak = progress.data?.progress.currentStreakWeeks ?? 0;
  const schedule = today.data?.schedule;
  const weekPct = schedule && schedule.targetCount ? Math.min(100, (schedule.completedCount / schedule.targetCount) * 100) : 0;

  return (
    <div className="page">
      <div className="stack-sm">
        <span className="muted">{greeting()},</span>
        <h1 className="page-title">{profile.data ? `${profile.data.profile.name} 👋` : " "}</h1>
      </div>

      {today.loading ? (
        <SkeletonBlock height={200} />
      ) : today.error ? (
        <ErrorState message={today.error} onRetry={today.reload} />
      ) : (
        today.data && <TodayCard today={today.data} />
      )}

      {schedule && (
        <div className="card stack">
          <div className="row-between">
            <h2 className="section-title">Weekly progress</h2>
            <span className="small muted">
              {schedule.completedCount}/{schedule.targetCount} workouts
            </span>
          </div>
          <ProgressBar value={weekPct} label="Weekly progress" />
          <WeekStrip schedule={schedule} />
        </div>
      )}

      {progress.data && (
        <div className="card row">
          <span className="option-icon" style={{ background: "var(--orange-soft)", color: "var(--orange)" }}>
            <Flame size={20} />
          </span>
          <div className="stack-sm grow">
            <span className="stat-label">Current streak</span>
            <span className="stat-value" style={{ fontSize: 24 }}>
              {streak} week{streak === 1 ? "" : "s"} {streak > 0 ? "🔥" : ""}
            </span>
          </div>
          <span className="small faint" style={{ maxWidth: 140, textAlign: "right" }}>
            {streak > 0 ? "Weeks in a row hitting your target" : "Hit your weekly target to start a streak"}
          </span>
        </div>
      )}

      <InsightCard />
    </div>
  );
}

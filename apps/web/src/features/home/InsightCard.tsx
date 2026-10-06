import { Sparkles } from "lucide-react";
import type { InsightsResponse } from "@gymfit/shared";
import { SkeletonBlock, SourceBadge } from "../../components/ui";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";

const KIND_COLOR: Record<string, string> = {
  safety: "var(--orange)",
  progress: "var(--accent)",
  recovery: "var(--blue)",
  consistency: "var(--accent)",
  goal: "var(--blue)",
  tip: "var(--muted)",
};

export function InsightCard() {
  const { data, loading, error } = useAsync(() => api.post<InsightsResponse>("/ai/fitness-insight", {}));
  if (loading) return <SkeletonBlock height={110} />;
  if (error || !data?.insights.length) return null;
  const [first, ...rest] = data.insights;
  return (
    <div className="card stack">
      <div className="row-between">
        <div className="row">
          <Sparkles size={18} color="var(--accent)" />
          <h2 className="section-title">AI Insight</h2>
        </div>
        <SourceBadge source={data.meta.source} />
      </div>
      <div className="stack-sm" style={{ borderLeft: `3px solid ${KIND_COLOR[first!.kind]}`, paddingLeft: 12 }}>
        <span style={{ fontWeight: 700 }}>{first!.title}</span>
        <span className="muted" style={{ lineHeight: 1.5 }}>{first!.message}</span>
        <span className="small faint">Based on: {first!.evidence}</span>
      </div>
      {rest.length > 0 && (
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            {rest.length} more insight{rest.length > 1 ? "s" : ""}
          </summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {rest.map((i) => (
              <div key={i.title} className="stack-sm" style={{ borderLeft: `3px solid ${KIND_COLOR[i.kind]}`, paddingLeft: 12 }}>
                <span style={{ fontWeight: 700 }}>{i.title}</span>
                <span className="small muted">{i.message}</span>
                <span className="small faint">Based on: {i.evidence}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

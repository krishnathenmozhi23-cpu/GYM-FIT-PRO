import { useEffect, useState } from "react";
import { SkipForward } from "lucide-react";
import { Button } from "../../components/ui";

/** Full-width rest countdown with a progress ring. */
export function RestTimer({ endsAt, total, onDone, onAdd }: { endsAt: number; total: number; onDone: () => void; onAdd: (s: number) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => {
    if (remaining === 0) {
      navigator.vibrate?.([150, 80, 150]);
      onDone();
    }
  }, [remaining, onDone]);

  const r = 80;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? remaining / total : 0;
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Rest timer">
      <div className="sheet" style={{ alignItems: "center", gap: 18, paddingTop: 24 }}>
        <span className="eyebrow">Rest</span>
        <div className="rest-ring">
          <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden>
            <circle cx="90" cy="90" r={r} stroke="var(--surface-3)" strokeWidth="10" fill="none" />
            <circle cx="90" cy="90" r={r} stroke="var(--accent)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 0.25s linear" }} />
          </svg>
          <span className="timer" aria-live="polite">
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        </div>
        <div className="grid-2" style={{ width: "100%" }}>
          <Button variant="secondary" onClick={() => onAdd(15)}>+15s</Button>
          <Button onClick={onDone}>
            <SkipForward size={16} /> Skip rest
          </Button>
        </div>
      </div>
    </div>
  );
}

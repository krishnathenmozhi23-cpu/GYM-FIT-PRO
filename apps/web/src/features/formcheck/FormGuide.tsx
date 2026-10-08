import { useEffect, useMemo, useState } from "react";
import type { FormProfileId } from "@gymfit/shared";
import { GUIDES } from "./guides";
import { POSE_CONNECTIONS } from "./pose";
import { frontPose, sidePose, tween } from "./skeleton";

const SEGMENT_MS = 1100;

export function poseAt(profile: FormProfileId, t: number) {
  const g = GUIDES[profile];
  const n = g.keys.length - 1;
  // Always within [0, n): rAF timestamps can be slightly earlier than `start`.
  const pos = (((Math.max(0, t) / SEGMENT_MS) % n) + n) % n;
  const i = Math.min(Math.floor(pos), n - 1);
  return g.view === "side"
    ? sidePose({ origin: { x: 0.5, y: 0.9 }, ...tween(g.keys[i]!, g.keys[i + 1]!, pos - i) })
    : frontPose(tween(g.keys[i]!, g.keys[i + 1]!, pos - i));
}

/** Looping stick-figure demonstration of the target movement. */
export function FormGuide({ profile }: { profile: FormProfileId }) {
  const [t, setT] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      setT(Math.max(0, now - start));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // Fit the view box to the whole movement so it never leaves the frame.
  const viewBox = useMemo(() => {
    const g = GUIDES[profile];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let s = 0; s < (g.keys.length - 1) * 10; s++) {
      for (const [i, p] of poseAt(profile, (s / 10) * SEGMENT_MS).entries()) {
        if (i !== 0 && i < 11) continue;
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    }
    const pad = 0.08;
    const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
    const size = Math.max(w, h * (4 / 3));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return `${cx - size / 2} ${cy - (size * 0.75) / 2} ${size} ${size * 0.75}`;
  }, [profile]);

  const lm = poseAt(profile, reduced ? SEGMENT_MS * 0.999 : t);
  const head = lm[0]!;
  const floorY = Math.max(lm[31]!.y, lm[32]!.y) + 0.012;
  return (
    <figure className="stack-sm" style={{ margin: 0 }}>
      <svg className="form-guide" viewBox={viewBox} role="img" aria-label={`Animated form guide: ${GUIDES[profile].caption}`}>
        <line x1="-5" x2="5" y1={floorY} y2={floorY} stroke="var(--border)" strokeWidth="0.006" />
        {POSE_CONNECTIONS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={lm[a]!.x} y1={lm[a]!.y} x2={lm[b]!.x} y2={lm[b]!.y} stroke="var(--accent)" strokeWidth="0.018" strokeLinecap="round" />
        ))}
        <circle cx={head.x} cy={head.y} r="0.035" fill="var(--accent)" />
      </svg>
      <figcaption className="small muted">{GUIDES[profile].caption}</figcaption>
    </figure>
  );
}

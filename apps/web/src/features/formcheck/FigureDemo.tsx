import { useEffect, useMemo, useState } from "react";
import { FIGURE_SEGMENT_MS, FLOOR_Y, figureAt, type Figure, type FigurePoint } from "./figures";

function usePlayhead(playing: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now() - t;
    const loop = (now: number) => {
      setT(Math.max(0, now - start));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  return t;
}

const pts = (chain: FigurePoint[]) => chain.map((q) => `${q.x},${q.y}`).join(" ");

/** Looping animated figure for exercises without demonstration photos. */
export function FigureDemo({ figure, playing, label }: { figure: Figure; playing: boolean; label: string }) {
  const t = usePlayhead(playing);

  // Fit the view box to the whole movement so the figure never leaves the frame.
  const viewBox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    const steps = (figure.keys.length - 1) * 12;
    for (let s = 0; s <= steps; s++) {
      const p = figureAt(figure, (s / 12) * FIGURE_SEGMENT_MS);
      for (const q of [p.head, ...p.legs.flat(), ...p.arms.flat()]) {
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y - 0.06);
      }
    }
    const maxY = FLOOR_Y + 0.03;
    const pad = 0.06;
    const w = maxX - minX + pad * 2, h = maxY - minY + pad;
    const height = Math.max(h, (w * 9) / 16);
    const width = (height * 16) / 9;
    const cx = (minX + maxX) / 2;
    return `${cx - width / 2} ${maxY - height} ${width} ${height}`;
  }, [figure]);

  const p = figureAt(figure, t);
  const far = "color-mix(in srgb, var(--accent) 45%, transparent)";
  return (
    <svg className="demo-figure" viewBox={viewBox} role="img" aria-label={label}>
      <line x1="-5" x2="5" y1={FLOOR_Y + 0.006} y2={FLOOR_Y + 0.006} stroke="var(--border)" strokeWidth="0.006" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.022">
        <polyline points={pts(p.legs[1])} stroke={far} />
        <polyline points={pts(p.arms[1])} stroke={far} />
        <polyline points={pts([p.hip, p.neck])} stroke="var(--accent)" />
        <polyline points={pts(p.legs[0])} stroke="var(--accent)" />
        <polyline points={pts(p.arms[0])} stroke="var(--accent)" />
      </g>
      <circle cx={p.head.x} cy={p.head.y} r="0.05" fill="var(--accent)" />
    </svg>
  );
}

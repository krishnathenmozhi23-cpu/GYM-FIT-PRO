import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formProfileFor, type Exercise } from "@gymfit/shared";
import { DEMO_PHOTOS, DEMO_SOURCE_URL, demoPhotoUrls } from "./demoPhotos";
import { FIGURES } from "./figures";
import { FigureDemo } from "./FigureDemo";
import { FormGuide } from "./FormGuide";

/** YouTube watch/share/shorts URL → privacy-enhanced embed URL; null for anything else. */
export function youTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/)?.[1] ?? null;
    }
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
  } catch {
    return null;
  }
}

export type DemoKind = "video" | "photos" | "figure" | "guide" | "none";

/** Which demonstration an exercise gets, best first. */
export function demoKind(exercise: Pick<Exercise, "id" | "videoUrl">): DemoKind {
  if (exercise.videoUrl) return "video";
  if (DEMO_PHOTOS[exercise.id]) return "photos";
  if (FIGURES[exercise.id]) return "figure";
  if (formProfileFor(exercise.id)) return "guide";
  return "none";
}

const PHOTO_MS = 1300;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function PlayToggle({ playing, onToggle, name }: { playing: boolean; onToggle: () => void; name: string }) {
  return (
    <button type="button" className="demo-toggle" onClick={onToggle} aria-label={playing ? `Pause ${name} demo` : `Play ${name} demo`}>
      {playing ? <Pause size={16} /> : <Play size={16} />}
    </button>
  );
}

function PhotoDemo({ exerciseId, name, playing }: { exerciseId: string; name: string; playing: boolean }) {
  const urls = demoPhotoUrls(exerciseId);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!playing || urls.length < 2) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % urls.length), PHOTO_MS);
    return () => clearInterval(id);
  }, [playing, urls.length]);
  return (
    <div className="demo-photos">
      {urls.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === frame ? `${name} demonstration, ${urls.length > 1 ? (i === 0 ? "first" : "second") + " position" : "position"}` : ""}
          aria-hidden={i !== frame}
          loading="lazy"
          decoding="async"
          style={{ opacity: i === frame ? 1 : 0 }}
        />
      ))}
      {urls.length > 1 && (
        <span className="demo-step" aria-hidden>
          {frame + 1}/{urls.length}
        </span>
      )}
    </div>
  );
}

/**
 * Plays a demonstration of the movement: a reviewed video if one is set,
 * otherwise demonstration photos alternating between the two positions,
 * otherwise an animated figure.
 */
export function MovementDemo({ exercise }: { exercise: Pick<Exercise, "id" | "name" | "videoUrl"> }) {
  const kind = demoKind(exercise);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());

  if (kind === "video") {
    const embed = youTubeEmbed(exercise.videoUrl!);
    return (
      <div className="video-frame">
        {embed ? (
          <iframe
            src={embed}
            title={`${exercise.name} demonstration`}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video src={exercise.videoUrl!} controls playsInline muted loop preload="metadata" aria-label={`${exercise.name} demonstration`} />
        )}
      </div>
    );
  }

  if (kind === "photos") {
    const d = DEMO_PHOTOS[exercise.id]!;
    return (
      <figure className="stack-sm" style={{ margin: 0 }}>
        <div className="demo-frame">
          <PhotoDemo exerciseId={exercise.id} name={exercise.name} playing={playing} />
          {(d.frames ?? [0, 1]).length > 1 && <PlayToggle playing={playing} onToggle={() => setPlaying((p) => !p)} name={exercise.name} />}
        </div>
        <figcaption className="small faint">
          {d.variant ? `${d.variant}. ` : ""}
          Photos: <a href={DEMO_SOURCE_URL} target="_blank" rel="noopener noreferrer">Free Exercise DB</a> (public domain).
        </figcaption>
      </figure>
    );
  }

  if (kind === "figure") {
    const fig = FIGURES[exercise.id]!;
    return (
      <figure className="stack-sm" style={{ margin: 0 }}>
        <div className="demo-frame">
          <FigureDemo figure={fig} playing={playing} label={`Animated demonstration: ${fig.caption}`} />
          <PlayToggle playing={playing} onToggle={() => setPlaying((p) => !p)} name={exercise.name} />
        </div>
        <figcaption className="small muted">{fig.caption}</figcaption>
      </figure>
    );
  }

  const profile = formProfileFor(exercise.id);
  if (kind === "guide" && profile) return <FormGuide profile={profile.id} />;
  return null;
}

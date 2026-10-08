import { ExternalLink, PlayCircle } from "lucide-react";
import { formProfileFor, type Exercise } from "@gymfit/shared";
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

export function youTubeSearch(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form`)}`;
}

/** Reference video (if one has been reviewed), animated form guide, and a search link. */
export function LearnMovement({ exercise }: { exercise: Pick<Exercise, "id" | "name" | "videoUrl"> }) {
  const profile = formProfileFor(exercise.id);
  const embed = exercise.videoUrl ? youTubeEmbed(exercise.videoUrl) : null;
  return (
    <div className="stack">
      {exercise.videoUrl &&
        (embed ? (
          <div className="video-frame">
            <iframe
              src={embed}
              title={`${exercise.name} demonstration`}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="video-frame">
            <video src={exercise.videoUrl} controls playsInline preload="metadata" aria-label={`${exercise.name} demonstration`} />
          </div>
        ))}
      {profile && <FormGuide profile={profile.id} />}
      {!exercise.videoUrl && (
        <a className="btn btn-secondary btn-sm" href={youTubeSearch(exercise.name)} target="_blank" rel="noopener noreferrer">
          <PlayCircle size={16} /> Find demonstration videos <ExternalLink size={14} />
        </a>
      )}
      {!exercise.videoUrl && (
        <p className="small faint">
          Opens a YouTube search — videos there aren't reviewed by GymFit Pro. Compare them with the written instructions below.
        </p>
      )}
    </div>
  );
}

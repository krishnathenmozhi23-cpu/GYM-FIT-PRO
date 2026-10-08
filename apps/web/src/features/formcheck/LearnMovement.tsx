import { ExternalLink, PlayCircle } from "lucide-react";
import { formProfileFor, type Exercise } from "@gymfit/shared";
import { FormGuide } from "./FormGuide";
import { MovementDemo, demoKind } from "./MovementDemo";

export { youTubeEmbed } from "./MovementDemo";

export function youTubeSearch(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form`)}`;
}

/** Demonstration (video, photos or animation), the camera's reference movement, and a search link. */
export function LearnMovement({ exercise }: { exercise: Pick<Exercise, "id" | "name" | "videoUrl"> }) {
  const profile = formProfileFor(exercise.id);
  const kind = demoKind(exercise);
  return (
    <div className="stack">
      <MovementDemo exercise={exercise} />
      {profile && kind !== "guide" && (
        <div className="stack-sm">
          <span className="eyebrow">What the camera form check looks for</span>
          <FormGuide profile={profile.id} />
        </div>
      )}
      <a className="btn btn-secondary btn-sm" href={youTubeSearch(exercise.name)} target="_blank" rel="noopener noreferrer">
        <PlayCircle size={16} /> Find demonstration videos <ExternalLink size={14} />
      </a>
      <p className="small faint">Opens a YouTube search — videos there aren't reviewed by GymFit Pro. Compare them with the written instructions.</p>
    </div>
  );
}

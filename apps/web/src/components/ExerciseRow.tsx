import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { MUSCLE_LABELS, type Muscle, type WorkoutExerciseView } from "@gymfit/shared";
import { formatKg, formatReps } from "../lib/format";

export function prescriptionText(e: Pick<WorkoutExerciseView, "sets" | "repsMin" | "repsMax" | "durationSeconds">): string {
  return e.durationSeconds ? `${e.sets} × ${e.durationSeconds}s` : `${e.sets} × ${formatReps(e.repsMin, e.repsMax)}`;
}

export function ExerciseRow({ e, index }: { e: WorkoutExerciseView; index: number }) {
  return (
    <Link to={`/explore/${e.exerciseId}`} className="list-item">
      <span className="index-dot">{index + 1}</span>
      <div className="grow stack-sm">
        <span style={{ fontWeight: 700 }}>{e.exerciseName}</span>
        <span className="small muted">
          {prescriptionText(e)} · Rest {e.restSeconds}s
          {e.loaded && e.targetWeightKg !== null ? ` · ${formatKg(e.targetWeightKg)}` : ""}
        </span>
        <span className="small faint">{e.primaryMuscles.map((m) => MUSCLE_LABELS[m as Muscle] ?? m).join(", ")}</span>
      </div>
      <ChevronRight size={18} color="var(--faint)" />
    </Link>
  );
}

import { useState } from "react";
import { Timer } from "lucide-react";
import type { DailyWorkoutRequest, WorkoutView } from "@gymfit/shared";
import { Chip } from "../../components/ui";
import { QuickWorkoutSheet } from "./QuickWorkoutSheet";

/** "Short on time?" — condenses this workout to the minutes available. */
export function QuickAdjust({ workout }: { workout: WorkoutView }) {
  const [request, setRequest] = useState<DailyWorkoutRequest | null>(null);
  const options = [20, 30, 45].filter((m) => m < workout.estimatedMinutes);
  if (!options.length) return null;
  return (
    <div className="card card-tight stack-sm">
      <span className="row small muted" style={{ gap: 6 }}>
        <Timer size={15} /> Short on time? Get a condensed version:
      </span>
      <div className="chips">
        {options.map((m) => (
          <Chip key={m} selected={false} onClick={() => setRequest({ minutes: m, workoutId: workout.id })}>
            {m} min
          </Chip>
        ))}
      </div>
      {request && <QuickWorkoutSheet request={request} onClose={() => setRequest(null)} />}
    </div>
  );
}

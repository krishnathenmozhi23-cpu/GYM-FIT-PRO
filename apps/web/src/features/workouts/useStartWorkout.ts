import { useState } from "react";
import { useNavigate } from "react-router";
import type { SessionView } from "@gymfit/shared";
import { api, ApiError, errorMessage } from "../../lib/api";

/** Starts a plan workout (or resumes the active session if one exists). */
export function useStartWorkout() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(workoutId?: string) {
    setBusy(true);
    setError(null);
    try {
      const { session } = await api.post<{ session: SessionView }>("/workouts/start", workoutId ? { workoutId } : {});
      navigate(`/session/${session.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const { session } = await api.get<{ session: SessionView | null }>("/workout-session/active");
        if (session) {
          navigate(`/session/${session.id}`);
          return;
        }
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return { start, busy, error };
}

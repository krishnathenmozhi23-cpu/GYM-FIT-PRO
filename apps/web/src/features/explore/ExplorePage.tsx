import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Search } from "lucide-react";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISE_EQUIPMENT_LABELS,
  FITNESS_LEVELS,
  LEVEL_LABELS,
  MUSCLE_LABELS,
  type Exercise,
  type Muscle,
} from "@gymfit/shared";
import { Chip, EmptyState, ErrorState, SkeletonBlock } from "../../components/ui";
import { api } from "../../lib/api";
import { humanize } from "../../lib/format";
import { useAsync } from "../../lib/useAsync";

const MUSCLE_FILTERS: Muscle[] = ["chest", "back", "lats", "shoulders", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves", "core"];

export default function ExplorePage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    if (muscle) p.set("muscle", muscle);
    if (equipment) p.set("equipment", equipment);
    if (difficulty) p.set("difficulty", difficulty);
    if (category) p.set("category", category);
    if (availableOnly) p.set("availableOnly", "true");
    return p.toString();
  }, [debouncedQ, muscle, equipment, difficulty, category, availableOnly]);

  const { data, error, loading, reload } = useAsync(() => api.get<{ exercises: Exercise[] }>(`/exercises?${query}`), [query]);
  const toggle = (cur: string | null, v: string, set: (v: string | null) => void) => set(cur === v ? null : v);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Explore</h1>
      </div>
      <div className="input-suffix">
        <input className="input" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" style={{ paddingRight: 44 }} />
        <span>
          <Search size={18} />
        </span>
      </div>

      <div className="stack-sm">
        <span className="eyebrow">Muscle</span>
        <div className="scroll-x">
          {MUSCLE_FILTERS.map((m) => (
            <Chip key={m} selected={muscle === m} onClick={() => toggle(muscle, m, setMuscle)}>
              {MUSCLE_LABELS[m]}
            </Chip>
          ))}
        </div>
        <span className="eyebrow">Equipment</span>
        <div className="scroll-x">
          <Chip selected={availableOnly} onClick={() => setAvailableOnly((v) => !v)}>
            My equipment
          </Chip>
          {EXERCISE_EQUIPMENT.map((e) => (
            <Chip key={e} selected={equipment === e} onClick={() => toggle(equipment, e, setEquipment)}>
              {EXERCISE_EQUIPMENT_LABELS[e]}
            </Chip>
          ))}
        </div>
        <span className="eyebrow">Difficulty & type</span>
        <div className="scroll-x">
          {FITNESS_LEVELS.map((l) => (
            <Chip key={l} selected={difficulty === l} onClick={() => toggle(difficulty, l, setDifficulty)}>
              {LEVEL_LABELS[l]}
            </Chip>
          ))}
          {EXERCISE_CATEGORIES.filter((c) => c !== "mobility").map((c) => (
            <Chip key={c} selected={category === c} onClick={() => toggle(category, c, setCategory)}>
              {humanize(c)}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonBlock height={300} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.exercises.length ? (
        <div className="card">
          <EmptyState title="No exercises match" message="Try removing a filter." />
        </div>
      ) : (
        <div className="card">
          <p className="small muted">{data.exercises.length} exercises</p>
          <div className="list">
            {data.exercises.map((e) => (
              <Link key={e.id} to={`/explore/${e.id}`} className="list-item">
                <div className="grow stack-sm">
                  <span style={{ fontWeight: 700 }}>{e.name}</span>
                  <span className="small muted">
                    {e.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")} · {e.equipment.map((x) => EXERCISE_EQUIPMENT_LABELS[x]).join(" + ")}
                  </span>
                </div>
                <span className={`badge ${e.difficulty === "beginner" ? "badge-accent" : e.difficulty === "intermediate" ? "badge-blue" : "badge-orange"}`}>
                  {LEVEL_LABELS[e.difficulty]}
                </span>
                <ChevronRight size={18} color="var(--faint)" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { measurementEntrySchema, weightEntrySchema, type ProgressOverview } from "@gymfit/shared";
import { Alert, Button, Chip, Field, Sheet } from "../../components/ui";
import { api, errorMessage, localIsoDate } from "../../lib/api";

const SITES = [
  ["chestCm", "Chest"],
  ["waistCm", "Waist"],
  ["hipsCm", "Hips"],
  ["armCm", "Arm"],
  ["thighCm", "Thigh"],
  ["neckCm", "Neck"],
] as const;

export function LogEntrySheet({ open, onClose, onSaved, initial = "weight" }: { open: boolean; onClose: () => void; onSaved: (p: ProgressOverview) => void; initial?: "weight" | "measurement" }) {
  const [type, setType] = useState<"weight" | "measurement">(initial);
  const [date, setDate] = useState(localIsoDate());
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [sites, setSites] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : Number(s));

  async function save() {
    setError(null);
    const parsed =
      type === "weight"
        ? weightEntrySchema.safeParse({ recordedOn: date, weightKg: num(weight), bodyFatPct: num(bodyFat) })
        : measurementEntrySchema.safeParse({ recordedOn: date, ...Object.fromEntries(SITES.map(([k]) => [k, num(sites[k])])) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your entry");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ progress: ProgressOverview }>("/progress", { type, data: parsed.data });
      onSaved(res.progress);
      onClose();
      setWeight("");
      setBodyFat("");
      setSites({});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Log progress" footer={<Button block loading={busy} onClick={() => void save()}>Save</Button>}>
      <div className="stack">
        <div className="chips">
          <Chip selected={type === "weight"} onClick={() => setType("weight")}>Body weight</Chip>
          <Chip selected={type === "measurement"} onClick={() => setType("measurement")}>Measurements</Chip>
        </div>
        <Field label="Date" htmlFor="entry-date">
          <input id="entry-date" className="input" type="date" max={localIsoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {type === "weight" ? (
          <div className="grid-2">
            <Field label="Weight" htmlFor="entry-weight">
              <div className="input-suffix">
                <input id="entry-weight" className="input" type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                <span>kg</span>
              </div>
            </Field>
            <Field label="Body fat (optional)" htmlFor="entry-bf">
              <div className="input-suffix">
                <input id="entry-bf" className="input" type="number" inputMode="decimal" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
                <span>%</span>
              </div>
            </Field>
          </div>
        ) : (
          <div className="grid-2">
            {SITES.map(([key, label]) => (
              <Field key={key} label={label} htmlFor={`m-${key}`}>
                <div className="input-suffix">
                  <input id={`m-${key}`} className="input" type="number" inputMode="decimal" step="0.1" value={sites[key] ?? ""} onChange={(e) => setSites((s) => ({ ...s, [key]: e.target.value }))} />
                  <span>cm</span>
                </div>
              </Field>
            ))}
          </div>
        )}
        <p className="small faint">Tip: weigh in at the same time of day (e.g. mornings) for comparable numbers.</p>
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Sheet>
  );
}

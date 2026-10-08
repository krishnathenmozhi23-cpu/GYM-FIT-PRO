import type { WeekSchedule } from "@gymfit/shared";
import { localIsoDate } from "../lib/api";
import { DAY_NAMES } from "../lib/format";

export function WeekStrip({ schedule }: { schedule: WeekSchedule }) {
  const today = localIsoDate();
  return (
    <div className="week-strip" aria-label="This week">
      {schedule.days.map((d) => {
        const cls = [
          "week-day",
          d.status === "completed" ? "completed" : d.status === "rest" ? "" : "planned",
          d.date === today ? "today" : "",
        ].join(" ");
        const label = `${DAY_NAMES[d.dayOfWeek]}: ${d.status === "rest" ? "rest" : `${d.title ?? ""} (${d.status.replace("_", " ")})`}`;
        return (
          <div key={d.date} className={cls} title={label} aria-label={label}>
            <span>{DAY_NAMES[d.dayOfWeek]![0]}</span>
            <span className="dot" />
          </div>
        );
      })}
    </div>
  );
}

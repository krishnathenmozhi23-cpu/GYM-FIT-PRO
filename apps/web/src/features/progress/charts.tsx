import { useState, type ReactNode } from "react";
import { Table2, LineChart as LineIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { shortDate } from "../../lib/format";

/** Brand accent for single-series charts. */
export const SINGLE_SERIES = "#c6f432";
/**
 * Categorical slots for multi-series charts, validated (lightness band,
 * CVD separation, contrast) against the dark card surface #14171c.
 * Assigned in fixed order — never cycled.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];

const axisProps = {
  stroke: "var(--faint)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function TooltipBox({ active, payload, label, unit, fmt }: Pick<TooltipContentProps<number, string>, "active" | "payload" | "label"> & { unit: string; fmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ color: "var(--muted)", marginBottom: 4 }}>{fmt ? fmt(String(label)) : String(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="row" style={{ gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ color: "var(--text)" }}>
            {p.name}: <strong>{p.value}</strong> {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface Column<T> {
  key: keyof T & string;
  label: string;
  format?: (v: T[keyof T]) => string;
}

/** Chart card with a chart/table toggle (the table is the accessible view). */
export function ChartCard<T extends object>({
  title,
  subtitle,
  rows,
  columns,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: Column<T>[];
  children: ReactNode;
  empty?: ReactNode;
}) {
  const [table, setTable] = useState(false);
  return (
    <section className="card stack" aria-label={title}>
      <div className="row-between">
        <div className="stack-sm grow">
          <h2 className="section-title">{title}</h2>
          {subtitle && <span className="small muted">{subtitle}</span>}
        </div>
        {rows.length > 0 && (
          <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label={table ? "Show chart" : "Show table"} aria-pressed={table} onClick={() => setTable((t) => !t)}>
            {table ? <LineIcon size={16} /> : <Table2 size={16} />}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        empty
      ) : table ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ textAlign: "left", color: "var(--muted)", fontWeight: 600, padding: "6px 4px", borderBottom: "1px solid var(--border)" }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ padding: "6px 4px", borderBottom: "1px solid var(--border)" }}>
                      {c.format ? c.format(r[c.key]) : String(r[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-box">{children}</div>
      )}
    </section>
  );
}

export function TrendLine({ data, x, y, name, unit, color = SINGLE_SERIES }: { data: object[]; x: string; y: string; name: string; unit: string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
        <XAxis dataKey={x} {...axisProps} tickFormatter={(v) => shortDate(String(v))} minTickGap={24} />
        <YAxis {...axisProps} domain={["auto", "auto"]} width={48} />
        <Tooltip cursor={{ stroke: "var(--faint)" }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} unit={unit} fmt={shortDate} />} />
        <Line type="monotone" dataKey={y} name={name} stroke={color} strokeWidth={2} dot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MultiLine({ data, x, series, unit }: { data: object[]; x: string; series: { key: string; name: string }[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey={x} {...axisProps} tickFormatter={(v) => shortDate(String(v))} minTickGap={24} />
        <YAxis {...axisProps} domain={["auto", "auto"]} width={48} />
        <Tooltip cursor={{ stroke: "var(--faint)" }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} unit={unit} fmt={shortDate} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={{ r: 4, fill: SERIES[i % SERIES.length], stroke: "var(--surface)", strokeWidth: 2 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, x, y, name, unit }: { data: object[]; x: string; y: string; name: string; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey={x} {...axisProps} tickFormatter={(v) => shortDate(String(v))} />
        <YAxis {...axisProps} allowDecimals={false} width={48} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} unit={unit} fmt={(l) => `Week of ${shortDate(l)}`} />} />
        <Bar dataKey={y} name={name} fill={SINGLE_SERIES} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

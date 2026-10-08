import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, Minus, Plus, RefreshCw, X } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  block,
  small,
  loading,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean; small?: boolean; loading?: boolean }) {
  const cls = ["btn", `btn-${variant}`, block && "btn-block", small && "btn-sm", className].filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : children}
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="center-state">
      <Spinner />
      <span className="small">{label}</span>
    </div>
  );
}

export function SkeletonBlock({ height = 120 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="center-state" role="alert">
      <AlertCircle size={28} color="var(--danger)" />
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" small onClick={onRetry}>
          <RefreshCw size={16} /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="center-state">
      {icon}
      <p style={{ color: "var(--text)", fontWeight: 700 }}>{title}</p>
      {message && <p className="small">{message}</p>}
      {action}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "warn"; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function ProgressBar({ value, thin, label }: { value: number; thin?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`progress${thin ? " progress-thin" : ""}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

export function OptionCard({
  selected,
  onClick,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <button type="button" className="option" aria-pressed={selected} onClick={onClick}>
      {icon && <span className="option-icon">{icon}</span>}
      <span className="option-title">{title}</span>
      {description && <span className="option-desc">{description}</span>}
    </button>
  );
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-btn" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}>
        <Minus size={18} />
      </button>
      <div className="stepper-value" aria-live="polite">
        {value}
        {suffix && <span className="small muted"> {suffix}</span>}
      </div>
      <button type="button" className="icon-btn" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}>
        <Plus size={18} />
      </button>
    </div>
  );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 className="section-title">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose} style={{ width: 36, height: 36 }}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div style={{ paddingTop: 12 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function SourceBadge({ source }: { source: "ai" | "rule_engine" | "dev_mock" | null | undefined }) {
  if (source === "ai") return <span className="badge badge-accent">AI generated</span>;
  if (source === "dev_mock") return <span className="badge badge-orange">Dev mock — not real AI</span>;
  if (source === "rule_engine") return <span className="badge badge-blue">Built-in engine</span>;
  return null;
}

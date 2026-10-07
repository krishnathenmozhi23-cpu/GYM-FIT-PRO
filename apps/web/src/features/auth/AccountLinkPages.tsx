import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Brand } from "../../components/Brand";
import { Alert, Button, Field, LoadingState } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../state/auth";

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="auth-wrap page">
        <Brand />
        <div className="stack-sm">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <Alert kind="info">
          <MailCheck size={18} style={{ flexShrink: 0 }} />
          <span>If an account exists for {email}, a reset link is on its way. It expires in 60 minutes.</span>
        </Alert>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" block loading={busy} disabled={!email}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="small" style={{ color: "var(--accent)", textAlign: "center" }}>
        Back to log in
      </Link>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell title="Link incomplete">
        <Alert kind="error">This reset link is missing its token. Request a new one.</Alert>
        <Link to="/forgot-password" className="btn btn-primary">Request new link</Link>
      </Shell>
    );
  }
  return (
    <Shell title="Choose a new password" subtitle="You'll be signed out on all other devices.">
      {done ? (
        <div className="stack">
          <Alert kind="info">
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>Password updated. Log in with your new password.</span>
          </Alert>
          <Button block onClick={() => navigate("/login", { replace: true })}>
            Log in
          </Button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="New password" htmlFor="new-password">
            <input id="new-password" className="input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm-password">
            <input id="confirm-password" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <p className="small faint">At least 8 characters.</p>
          <Button type="submit" block loading={busy} disabled={password.length < 8 || !confirm}>
            Update password
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against React StrictMode's double effect run.
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState("error");
      setError("This verification link is missing its token.");
      return;
    }
    api.post("/auth/verify-email", { token }).then(
      () => {
        setState("ok");
        void refresh();
      },
      (err) => {
        setState("error");
        setError(errorMessage(err));
      },
    );
  }, [token, refresh]);

  return (
    <Shell title="Email verification">
      {state === "working" && <LoadingState label="Confirming your email…" />}
      {state === "ok" && (
        <Alert kind="info">
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>Your email is confirmed.</span>
        </Alert>
      )}
      {state === "error" && <Alert kind="error">{error}</Alert>}
      {state !== "working" && (
        <Link to={user ? "/profile" : "/login"} className="btn btn-primary">
          {user ? "Back to profile" : "Log in"}
        </Link>
      )}
    </Shell>
  );
}

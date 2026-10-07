import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Brand } from "../../components/Brand";
import { Alert, Button, Field } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../state/auth";

/** Log in to an account that has an email and password. New users start from /welcome. */
export function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(user.onboardingCompleted ? "/" : "/onboarding", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="auth-wrap page">
        <Brand />
        <div className="stack">
          <h1 className="hero-title">
            Welcome <em>back.</em>
          </h1>
          <p className="muted">Log in to continue on this device.</p>
        </div>
        <form className="stack" onSubmit={onSubmit} noValidate>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="password">
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Link to="/forgot-password" className="small" style={{ color: "var(--muted)", alignSelf: "flex-end" }}>
            Forgot password?
          </Link>
          <Button type="submit" block loading={busy} disabled={!email || !password}>
            Log in
          </Button>
        </form>
        <p className="small muted" style={{ textAlign: "center" }}>
          New here?{" "}
          <Link to="/welcome" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Get started — no sign-up needed
          </Link>
        </p>
      </div>
    </div>
  );
}

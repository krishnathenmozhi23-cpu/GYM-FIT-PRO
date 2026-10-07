import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Brand } from "../../components/Brand";
import { Alert, Button, Field } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../state/auth";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = isLogin ? await login(email, password) : await register(email, password);
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
            {isLogin ? (
              <>
                Welcome <em>back.</em>
              </>
            ) : (
              <>
                Your personal <em>AI trainer.</em>
              </>
            )}
          </h1>
          <p className="muted">
            {isLogin
              ? "Pick up where you left off."
              : "Plans built around your goal, equipment and schedule — and they adapt as you progress."}
          </p>
        </div>
        <form className="stack" onSubmit={onSubmit} noValidate>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {!isLogin && <p className="small faint">At least 8 characters.</p>}
          {isLogin && (
            <Link to="/forgot-password" className="small" style={{ color: "var(--muted)", alignSelf: "flex-end" }}>
              Forgot password?
            </Link>
          )}
          <Button type="submit" block loading={busy} disabled={!email || !password}>
            {isLogin ? "Log in" : "Create account"}
          </Button>
        </form>
        <p className="small muted" style={{ textAlign: "center" }}>
          {isLogin ? "New here? " : "Already have an account? "}
          <Link to={isLogin ? "/register" : "/login"} style={{ color: "var(--accent)", fontWeight: 600 }}>
            {isLogin ? "Create an account" : "Log in"}
          </Link>
        </p>
      </div>
    </div>
  );
}

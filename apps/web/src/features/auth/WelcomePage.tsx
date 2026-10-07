import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Activity, CalendarCheck, Sparkles, TrendingUp } from "lucide-react";
import { Brand } from "../../components/Brand";
import { Alert, Button } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../state/auth";

const POINTS = [
  { icon: <CalendarCheck size={18} />, text: "A weekly plan built around your goal, equipment and schedule" },
  { icon: <Activity size={18} />, text: "Guided workouts with set, rep and rest tracking" },
  { icon: <TrendingUp size={18} />, text: "Loads and volume adapt to what you actually lift" },
  { icon: <Sparkles size={18} />, text: "An AI coach that knows your plan and history" },
];

/** Entry screen: no email or password needed to start. */
export function WelcomePage() {
  const { startAsGuest } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await startAsGuest();
      navigate("/onboarding", { replace: true });
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
            Your personal <em>AI trainer.</em>
          </h1>
          <p className="muted">Plans built around your goal, equipment and schedule — and they adapt as you progress.</p>
        </div>
        <div className="stack-sm">
          {POINTS.map((p) => (
            <div key={p.text} className="row" style={{ gap: 12 }}>
              <span className="option-icon">{p.icon}</span>
              <span className="small">{p.text}</span>
            </div>
          ))}
        </div>
        <div className="stack">
          {error && <Alert kind="error">{error}</Alert>}
          <Button block loading={busy} onClick={() => void start()}>
            Get started
          </Button>
          <p className="small faint" style={{ textAlign: "center" }}>
            No sign-up needed. Your progress is saved on this device — add an email later in Profile to keep it safe.
          </p>
        </div>
        <p className="small muted" style={{ textAlign: "center" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

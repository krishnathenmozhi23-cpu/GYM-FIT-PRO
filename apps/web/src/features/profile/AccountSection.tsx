import { useState } from "react";
import { BadgeCheck, Download, KeyRound, LogOut, MailWarning, Trash2 } from "lucide-react";
import { Alert, Button, Field, Sheet } from "../../components/ui";
import { api, apiUrl, errorMessage } from "../../lib/api";
import { useAuth } from "../../state/auth";

type Panel = null | "password" | "everywhere" | "delete";

export function AccountSection() {
  const { user, refresh } = useAuth();
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmText, setConfirmText] = useState("");

  function open(p: Panel) {
    setPanel(p);
    setError(null);
    setCurrent("");
    setNext("");
    setConfirmText("");
  }

  async function run(fn: () => Promise<unknown>, onDone: () => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setNotice(null);
    try {
      await api.post("/auth/verify-email/resend");
      setNotice("Verification email sent. Check your inbox.");
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  if (!user) return null;
  return (
    <div className="card stack">
      <h2 className="section-title">Account & security</h2>
      <div className="row-between">
        <span className="small muted" style={{ overflowWrap: "anywhere" }}>{user.email}</span>
        {user.emailVerified ? (
          <span className="badge badge-accent">
            <BadgeCheck size={12} /> Verified
          </span>
        ) : (
          <span className="badge badge-orange">
            <MailWarning size={12} /> Not verified
          </span>
        )}
      </div>
      {!user.emailVerified && (
        <Button variant="secondary" small onClick={() => void resend()}>
          Resend verification email
        </Button>
      )}
      {notice && <Alert kind="info">{notice}</Alert>}
      <div className="grid-2">
        <Button variant="secondary" small onClick={() => open("password")}>
          <KeyRound size={16} /> Change password
        </Button>
        <a className="btn btn-secondary btn-sm" href={apiUrl("/auth/export")} download>
          <Download size={16} /> Download data
        </a>
        <Button variant="secondary" small onClick={() => open("everywhere")}>
          <LogOut size={16} /> Sign out all devices
        </Button>
        <Button variant="danger" small onClick={() => open("delete")}>
          <Trash2 size={16} /> Delete account
        </Button>
      </div>

      <Sheet open={panel === "password"} onClose={() => setPanel(null)} title="Change password">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => api.post("/auth/change-password", { currentPassword: current, newPassword: next }),
              () => {
                setPanel(null);
                setNotice("Password changed. Other devices have been signed out.");
              },
            );
          }}
        >
          <Field label="Current password" htmlFor="cur-pw">
            <input id="cur-pw" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="new-pw">
            <input id="new-pw" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <p className="small faint">At least 8 characters. You'll stay signed in here; other devices will be signed out.</p>
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" block loading={busy} disabled={!current || next.length < 8}>
            Update password
          </Button>
        </form>
      </Sheet>

      <Sheet open={panel === "everywhere"} onClose={() => setPanel(null)} title="Sign out of all devices?">
        <div className="stack">
          <p className="muted">Every session, including this one, will be signed out. Use this if you've lost a device or shared your login.</p>
          {error && <Alert kind="error">{error}</Alert>}
          <Button block loading={busy} onClick={() => void run(() => api.post("/auth/sign-out-everywhere"), refresh)}>
            Sign out everywhere
          </Button>
        </div>
      </Sheet>

      <Sheet open={panel === "delete"} onClose={() => setPanel(null)} title="Delete your account?">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.post("/auth/delete-account", { password: current }), refresh);
          }}
        >
          <Alert kind="error">
            This permanently deletes your profile, plans, workout history, progress and chats. It can't be undone. Download your data first if you want a copy.
          </Alert>
          <Field label="Password" htmlFor="del-pw">
            <input id="del-pw" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label='Type "DELETE" to confirm' htmlFor="del-confirm">
            <input id="del-confirm" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" variant="danger" block loading={busy} disabled={!current || confirmText !== "DELETE"}>
            Permanently delete account
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

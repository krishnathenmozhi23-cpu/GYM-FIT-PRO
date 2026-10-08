import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Info, ShieldAlert, SwitchCamera, Volume2, VolumeX, X } from "lucide-react";
import { issueDef, type FormCheckResult, type FormProfile } from "@gymfit/shared";
import { Alert, Button, Spinner } from "../../components/ui";
import { FormAnalyzer, type AnalyzerState } from "./analyzer";
import { loadPoseLandmarker, POSE_CONNECTIONS } from "./pose";

type Summary = Omit<FormCheckResult, "sessionExerciseId">;
type Stage = "intro" | "starting" | "live" | "summary";

const SEVERITY_COLOR = { risk: "var(--danger)", form: "var(--warning)", tip: "var(--blue)" } as const;
const SEVERITY_LABEL = { risk: "Injury risk", form: "Form", tip: "Tip" } as const;
const SPEAK_GAP_MS = 2500;

function cameraError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (!window.isSecureContext) return "The camera only works on a secure (https) page or on localhost.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser doesn't support camera access.";
  if (name === "NotAllowedError") return "Camera permission was denied. Allow camera access in your browser settings and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is being used by another app.";
  return `Couldn't start the form check: ${(err as Error)?.message ?? "unknown error"}`;
}

export function FormCheckCamera({
  profile,
  exerciseName,
  onClose,
  onSave,
}: {
  profile: FormProfile;
  exerciseName: string;
  onClose: () => void;
  /** Omit for practice mode (nothing is saved). */
  onSave?: (summary: Summary) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const analyzerRef = useRef<FormAnalyzer | null>(null);
  const lastSpokenRef = useRef(0);
  const voiceRef = useRef(true);
  const [stage, setStage] = useState<Stage>("intro");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<AnalyzerState | null>(null);
  const [tracking, setTracking] = useState(false);
  const [voice, setVoice] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);

  voiceRef.current = voice;

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  function speak(text: string) {
    if (!voiceRef.current || !window.speechSynthesis) return;
    const now = performance.now();
    if (now - lastSpokenRef.current < SPEAK_GAP_MS) return;
    lastSpokenRef.current = now;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  function draw(landmarks: { x: number; y: number; visibility?: number }[] | undefined, flagged: Set<number>) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!landmarks) return;
    const lw = Math.max(3, w / 200);
    for (const [a, b] of POSE_CONNECTIONS) {
      const p = landmarks[a], q = landmarks[b];
      if (!p || !q || (p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) continue;
      ctx.strokeStyle = flagged.has(a) || flagged.has(b) ? "#ff5c5c" : "rgba(198,244,50,0.9)";
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(p.x * w, p.y * h);
      ctx.lineTo(q.x * w, q.y * h);
      ctx.stroke();
    }
    for (const [i, p] of landmarks.entries()) {
      if (i < 11 || (p.visibility ?? 1) < 0.5) continue;
      ctx.fillStyle = flagged.has(i) ? "#ff5c5c" : "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, lw * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  async function start(nextFacing = facing) {
    setError(null);
    setStage("starting");
    stopCamera();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
      const [landmarker, stream] = await Promise.all([
        loadPoseLandmarker(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      ]);
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      analyzerRef.current ??= new FormAnalyzer(profile.id);
      setStage("live");

      let lastHud = 0;
      let lastVideoTime = -1;
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const result = landmarker.detectForVideo(video, now);
        const lm = result.landmarks[0];
        const analyzer = analyzerRef.current!;
        if (lm) {
          for (const e of analyzer.update({ landmarks: lm, t: now, aspect: video.videoWidth / Math.max(video.videoHeight, 1) })) {
            if (e.type === "issue" && e.severity !== "tip") speak(e.cue);
          }
        } else {
          analyzer.update({ landmarks: [], t: now, aspect: 1 });
        }
        draw(lm, new Set(analyzer.state.flaggedJoints));
        if (now - lastHud > 100) {
          lastHud = now;
          setHud({ ...analyzer.state });
          setTracking(Boolean(lm));
        }
      };
      loop();
    } catch (err) {
      stopCamera();
      setStage("intro");
      setError(cameraError(err));
    }
  }

  function finish() {
    stopCamera();
    setSummary(analyzerRef.current?.summary() ?? null);
    setStage("summary");
  }

  // Something worth saving: reps for rep exercises, hold time for holds.
  const detected = Boolean(summary && (profile.mode === "hold" ? summary.durationSeconds > 0 : summary.reps > 0));

  async function save() {
    // Nothing to save in practice mode or when no reps/hold were detected.
    if (!summary || !onSave || !detected) return onClose();
    setSaving(true);
    try {
      await onSave(summary);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const mirrored = facing === "user";
  const topCue = hud?.cues.find((c) => c.severity === "risk") ?? hud?.cues.find((c) => c.severity === "form") ?? hud?.cues[0];

  return (
    <div className="formcheck" role="dialog" aria-modal="true" aria-label={`Form check: ${exerciseName}`}>
      <div className="formcheck-top">
        <div className="stack-sm">
          <span className="eyebrow">Form check{onSave ? "" : " · practice"}</span>
          <strong>{exerciseName}</strong>
        </div>
        <button className="icon-btn" aria-label="Close form check" onClick={() => { stopCamera(); onClose(); }}>
          <X size={20} />
        </button>
      </div>

      {stage === "intro" && (
        <div className="formcheck-body stack">
          <div className="row" style={{ gap: 12 }}>
            <span className="option-icon"><Camera size={18} /></span>
            <p style={{ lineHeight: 1.5 }}>{profile.setup}</p>
          </div>
          <Alert kind="info">
            <Info size={18} style={{ flexShrink: 0 }} />
            <span>Video is analysed on this device and never uploaded. Only rep counts and form issues are saved.</span>
          </Alert>
          <div className="stack-sm">
            <span className="eyebrow">What it checks</span>
            {profile.issues.filter((i) => i.code !== "body_not_visible").map((i) => (
              <span key={i.code} className="small row" style={{ gap: 8 }}>
                <span className="dot-sev" style={{ background: SEVERITY_COLOR[i.severity] }} /> {i.label}
                <span className="faint">· {SEVERITY_LABEL[i.severity]}</span>
              </span>
            ))}
          </div>
          {profile.limits.length > 0 && (
            <p className="small faint">Can't check: {profile.limits.join(" ")}</p>
          )}
          <p className="small faint">The camera gives coaching cues from a 2D estimate and can be wrong. Stop if anything hurts.</p>
          {error && <Alert kind="error">{error}</Alert>}
          <Button block onClick={() => void start()}>
            <Camera size={18} /> Start camera
          </Button>
        </div>
      )}

      {(stage === "starting" || stage === "live") && (
        <div className="formcheck-live">
          <div className="formcheck-stage">
            <video ref={videoRef} playsInline muted style={{ transform: mirrored ? "scaleX(-1)" : undefined }} />
            <canvas ref={canvasRef} style={{ transform: mirrored ? "scaleX(-1)" : undefined }} />
            {stage === "starting" && (
              <div className="formcheck-overlay">
                <Spinner />
                <span>Loading pose model and camera…</span>
              </div>
            )}
            {stage === "live" && hud && (
              <>
                <div className="formcheck-count" aria-live="polite">
                  {profile.mode === "hold" ? (
                    <>
                      <span className="timer">{Math.floor(hud.holdSeconds)}s</span>
                      <span className="small">hold</span>
                    </>
                  ) : (
                    <>
                      <span className="timer">{hud.reps}</span>
                      <span className="small">reps · {hud.cleanReps} clean</span>
                    </>
                  )}
                </div>
                {(hud.setupHint || !tracking) && (
                  <div className="formcheck-banner" style={{ background: "rgba(91,140,255,0.92)" }} role="status">
                    {hud.setupHint ?? "Looking for you… make sure your whole body is in frame"}
                  </div>
                )}
                {!hud.setupHint && tracking && topCue && (
                  <div className="formcheck-banner" style={{ background: topCue.severity === "risk" ? "rgba(255,92,92,0.95)" : topCue.severity === "form" ? "rgba(255,181,71,0.95)" : "rgba(91,140,255,0.92)" }} role="alert">
                    {topCue.severity === "risk" && <ShieldAlert size={18} />} {topCue.cue}
                  </div>
                )}
                {!hud.setupHint && tracking && !topCue && hud.lastRep && (
                  <div className="formcheck-banner" style={{ background: hud.lastRep.issues.some((c) => issueDef(profile.id, c)?.severity !== "tip") ? "rgba(255,181,71,0.95)" : "rgba(61,220,151,0.92)" }}>
                    {hud.lastRep.issues.length === 0
                      ? `Rep ${hud.lastRep.rep}: good form`
                      : `Rep ${hud.lastRep.rep}: ${hud.lastRep.issues.map((c) => issueDef(profile.id, c)?.label ?? c).join(", ")}`}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="formcheck-controls">
            <button className="icon-btn" aria-label={voice ? "Turn voice cues off" : "Turn voice cues on"} aria-pressed={voice} onClick={() => setVoice((v) => !v)}>
              {voice ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <Button className="grow" onClick={finish} disabled={stage !== "live"}>
              Finish set
            </Button>
            <button
              className="icon-btn"
              aria-label="Switch camera"
              onClick={() => {
                const next = facing === "user" ? "environment" : "user";
                setFacing(next);
                void start(next);
              }}
            >
              <SwitchCamera size={20} />
            </button>
          </div>
        </div>
      )}

      {stage === "summary" && summary && (
        <div className="formcheck-body stack">
          <div className="grid-2">
            <div className="card card-tight">
              <div className="stat-value">{profile.mode === "hold" ? `${summary.durationSeconds}s` : summary.reps}</div>
              <div className="stat-label">{profile.mode === "hold" ? "Held" : "Reps counted"}</div>
            </div>
            <div className="card card-tight">
              <div className="stat-value">{profile.mode === "hold" ? summary.issues.reduce((n, i) => n + (i.severity !== "tip" ? i.count : 0), 0) + "s" : summary.cleanReps}</div>
              <div className="stat-label">{profile.mode === "hold" ? "With form issues" : "Clean reps"}</div>
            </div>
          </div>
          {summary.issues.length === 0 ? (
            <Alert kind="info">
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{detected ? "No form issues detected. Nice work." : profile.mode === "hold" ? "No hold was detected. Check the camera setup and try again." : "No reps were detected. Check the camera setup and try again."}</span>
            </Alert>
          ) : (
            <div className="stack-sm">
              {summary.issues.map((i) => {
                const d = issueDef(profile.id, i.code);
                return (
                  <div key={i.code} className="card card-tight stack-sm" style={{ borderLeft: `3px solid ${SEVERITY_COLOR[i.severity]}` }}>
                    <div className="row-between">
                      <strong>{d?.label ?? i.code}</strong>
                      <span className="small muted">
                        {i.count} {profile.mode === "hold" ? "s" : i.count === 1 ? "rep" : "reps"} · {SEVERITY_LABEL[i.severity]}
                      </span>
                    </div>
                    <span className="small">{d?.cue}</span>
                    <span className="small faint">{d?.why}</span>
                  </div>
                );
              })}
            </div>
          )}
          {summary.issues.some((i) => i.severity === "risk") && (
            <Alert kind="warn">Lower the weight or reps until you can move cleanly. If anything hurts, stop and get it checked by a professional.</Alert>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          <Button block loading={saving} onClick={() => void save()}>
            {onSave && detected ? "Save form check" : "Done"}
          </Button>
          <Button variant="secondary" block onClick={() => { analyzerRef.current = null; setSummary(null); void start(); }}>
            Check another set
          </Button>
        </div>
      )}
    </div>
  );
}

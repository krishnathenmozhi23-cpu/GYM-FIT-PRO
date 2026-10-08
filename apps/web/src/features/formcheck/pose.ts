import type { PoseLandmarker } from "@mediapipe/tasks-vision";

/** Self-hosted by scripts/setup-mediapipe.mjs (predev/prebuild). */
const WASM_BASE = "/mediapipe/wasm";
const LOCAL_MODEL = "/mediapipe/pose_landmarker_lite.task";
/** Official Google model storage, used if the local copy wasn't downloaded. */
const REMOTE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let loading: Promise<PoseLandmarker> | null = null;

async function modelPath(): Promise<string> {
  try {
    const res = await fetch(LOCAL_MODEL, { method: "HEAD" });
    const type = res.headers.get("content-type") ?? "";
    // Dev servers answer unknown paths with index.html; make sure it's the real file.
    if (res.ok && !type.includes("text/html")) return LOCAL_MODEL;
  } catch {
    /* fall through */
  }
  return REMOTE_MODEL;
}

/**
 * Loads the on-device pose model once (lazily — it's only downloaded when
 * someone opens the form check). Tries the GPU first, then the CPU.
 */
export function loadPoseLandmarker(): Promise<PoseLandmarker> {
  loading ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const modelAssetPath = await modelPath();
    const create = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })().catch((err) => {
    loading = null; // allow retry
    throw err;
  });
  return loading;
}

/** Skeleton connections for drawing (MediaPipe 33-point model). */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

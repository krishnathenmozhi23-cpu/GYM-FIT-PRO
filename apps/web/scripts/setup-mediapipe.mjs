// Prepares on-device pose detection assets in public/mediapipe (git-ignored):
//  - the MediaPipe WebAssembly runtime, copied from node_modules
//  - the pose landmarker model (Apache-2.0), downloaded once
// If the model download fails (offline install), the app falls back to
// loading it from Google's official model storage at runtime.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../public/mediapipe");
const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("@mediapipe/tasks-vision"));

export const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

mkdirSync(path.join(out, "wasm"), { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  const src = path.join(pkgDir, "wasm", f);
  const dst = path.join(out, "wasm", f);
  if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
}

const model = path.join(out, "pose_landmarker_lite.task");
if (!existsSync(model)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(model, Buffer.from(await res.arrayBuffer()));
    console.log("[mediapipe] downloaded pose model");
  } catch (err) {
    console.warn(`[mediapipe] could not download the pose model (${err.message}); the app will load it from Google at runtime.`);
  }
}

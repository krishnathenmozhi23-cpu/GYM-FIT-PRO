# GymFit Pro

An adaptive fitness platform: it builds a weekly plan from a user's profile, goal, level, equipment, schedule and limitations, tracks every set, and adapts future workouts from what was actually logged. An AI layer (Claude) can generate plans, daily workouts, exercise alternatives, insights and chat answers — always grounded in the user's data and always passed through a validation and safety layer before anything is saved.

> GymFit Pro gives general fitness guidance. It is not a medical service and does not diagnose or treat anything.

## Stack

| Layer | Tech |
|---|---|
| Web client | React 19, React Router 7, Vite 8, Recharts 3 — mobile-first |
| API | Node 22, Express 5, TypeScript, Zod 4, pino |
| Database | PostgreSQL 16 (plain SQL migrations, `pg`) |
| AI | `@anthropic-ai/sdk` with JSON-schema structured outputs |
| Tests | Vitest + Supertest (API, against a real Postgres), Playwright (e2e) |

```
apps/api        REST API, recommendation engine, AI service
apps/web        Web client
packages/shared Zod schemas + types shared by API and web (single source of truth)
e2e             Playwright end-to-end tests
```

## Architecture

```
Web client ──► REST API ──► auth ──► modules (profile, exercises, workouts, sessions, progress)
                                       │
                                       ├─► engine/   deterministic, pure functions (no I/O)
                                       │     split selection · exercise selection · prescriptions
                                       │     time budgeting · alternatives · weekly scheduling
                                       │     progression · analytics · insights
                                       │
                                       └─► ai/       context ─► provider ─► structured JSON
                                                     ─► Zod schema ─► domain validation ─► safety
                                                     ─► save (or fall back to the engine) ─► DB
```

**The AI never writes to the database.** A provider only returns JSON. `ai/service.ts` validates it (`ai/validation.ts`): exercise IDs must exist and be allowed for this user (equipment, limitations, level), the day count must match, sessions must fit the time budget, volume is capped, and suggested loads may not exceed the last working weight by more than 10%. Anything that fails is recorded in `ai_recommendations` with the reasons, and the deterministic engine's result is used instead. Every response carries `meta.source` (`ai`, `rule_engine` or `dev_mock`), shown in the UI.

**Safety** (`ai/safety.ts`): messages about chest pain, fainting or severe breathlessness are never sent to a model — the user gets a stop-and-seek-help reply. Pain, injury, medical and extreme-diet topics get a professional-referral note. Model replies that suggest < 1200 kcal/day, attempt a diagnosis, or claim to be a professional are blocked.

**Adaptation** (`engine/progression.ts`): double progression. When every set hits the top of the rep range (and the session wasn't rated "too hard"), load rises by the smallest practical increment (2.5 kg barbell/machine, 2 kg dumbbell); if that step would exceed ~10%, reps rise first. One bad session holds the load; two in a row reduce it ~10%. Bodyweight and timed work progress by reps/seconds. Two "too hard" ratings remove a set from accessories; three "easy" ratings add one to the main lift. Missed workouts are re-spread over the rest of the week rather than dropped or doubled up.

### AI providers

| `AI_PROVIDER` | Behaviour |
|---|---|
| `none` (default) | No LLM. The rule engine generates plans and insights; the assistant uses a rule-based intent handler over the user's data. Labelled "Built-in engine". |
| `mock` | **Development mock** — returns the engine's output through the full AI pipeline (schema → validation → persistence). Labelled "Dev mock — not real AI". |
| `anthropic` | Claude via the official SDK (`AI_MODEL`, default `claude-opus-5-5`), with server-side refusal fallbacks. Requires `ANTHROPIC_API_KEY`. |

Adding a provider = implementing `LlmProvider` in `apps/api/src/ai/providers/`.

## Getting started

Requirements: Node ≥ 22. That's it for local development:

```bash
npm install
npm run dev        # API on :4000 + web on http://localhost:5173
```

With no `apps/api/.env`, the API uses an **embedded PostgreSQL (PGlite)** stored in `apps/api/.data/`, generates a development secret, and applies migrations and the exercise seed on startup. Delete `apps/api/.data/` to start fresh.

To use a real PostgreSQL server (≥ 13) instead:

```bash
createuser -P gymfit              # password: gymfit
createdb -O gymfit gymfit
createdb -O gymfit gymfit_test    # for `npm test`
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL (and JWT_SECRET)
npm run dev
```

If the web app says "Can't reach the GymFit server", the API isn't running — check the `[api]` lines in the `npm run dev` output.

### Production (single process)

```bash
npm run build
cd apps/api
NODE_ENV=production API_PREFIX=/api WEB_DIST_DIR=../web/dist \
  DATABASE_URL=... JWT_SECRET=... CORS_ORIGIN=https://your.domain \
  node dist/migrate-cli.js && node dist/seed-cli.js && node dist/server.js
```

Run behind HTTPS (the session cookie is `Secure` in production).

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-check all packages |
| `npm run dev` | API + web together (zero-config with embedded PGlite) |
| `npm run dev:phone` | Same, with the web app on HTTPS on your network (camera form check on phones) |
| `npm test` | API unit + integration tests (needs `gymfit_test` DB; override with `TEST_DATABASE_URL`) and web unit tests |
| `TEST_DB=pglite npm test -w @gymfit/api` | Same API suite on in-memory embedded PostgreSQL — no database server needed |
| `npm run test:e2e` | Playwright e2e (starts dev servers; set `E2E_BASE_URL` to test a running build; `PLAYWRIGHT_CHROMIUM_PATH` for a custom Chromium) |
| `npm run build` | Bundle API (esbuild) and web (Vite) |

## REST API

All routes except `/auth/*` and `/health` require auth — an httpOnly session cookie (web) or `Authorization: Bearer <token>` (native clients). Clients may send `X-Client-Date: YYYY-MM-DD` so "today" follows the user's timezone. Errors use `{ "error": { "code", "message", "details?" } }`.

| Method & path | Purpose |
|---|---|
| `POST /auth/guest` | Start without email/password (guest account; long-lived, sliding session) |
| `POST /auth/claim` | Add email + password to a guest account, keeping all data |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Authentication (register is for API clients; the web app starts as a guest) |
| `POST /auth/forgot-password`, `POST /auth/reset-password` | Password reset via single-use emailed link (60 min); signs out all sessions |
| `POST /auth/verify-email`, `POST /auth/verify-email/resend` | Email verification (24 h link) |
| `POST /auth/change-password`, `POST /auth/sign-out-everywhere` | Session-revoking account security |
| `GET /auth/export`, `POST /auth/delete-account` | Download all your data as JSON; permanent deletion (password required) |
| `GET /profile`, `POST /profile` (onboarding), `PUT /profile` (partial) | Profile, goal, equipment, schedule, limitations |
| `GET /exercises?q&muscle&equipment&difficulty&category&availableOnly`, `GET /exercises/:id` | Library + alternatives |
| `GET /workouts/plan`, `POST /workouts/plan` | Active plan; regenerate with the engine only |
| `GET /workouts/today`, `GET /workouts/:id`, `POST /workouts/start` | Today's workout + weekly schedule; start a plan workout |
| `POST /workout-session` | Start an ad-hoc session (quick/condensed workout) |
| `GET /workout-session`, `GET /workout-session/active`, `GET /workout-session/:id` | History / active / detail |
| `POST /workout-session/:id/set`, `DELETE /workout-session/:id/set/:setId` | Log / undo a set |
| `PATCH /workout-session/:id/exercise/:sessionExerciseId` | `skip`, `complete` or `replace` |
| `POST /workout-session/:id/pause`, `/complete`, `/abandon` | Session lifecycle; `complete` returns plan adaptations |
| `POST /workout-session/:id/form-check` | Save camera form-check metrics (reps, clean reps, issue counts — no video) |
| `GET /progress`, `POST /progress` | Dashboard data; log weight or measurements |
| `GET /ai/status` | Configured provider |
| `POST /ai/workout-plan`, `/ai/daily-workout`, `/ai/recommend-exercise`, `/ai/fitness-insight`, `/ai/chat` | AI features (validated, with engine fallback) |
| `GET /ai/conversations/latest` | Chat history |

Differences from the original endpoint sketch: session completion lives at `POST /workout-session/:id/complete` (it completes a *session*, not a plan workout), and `POST /workout-session` starts an ad-hoc session.

## Data model

`users`, `user_profiles`, `fitness_goals` (one active), `exercises`, `workout_plans` (one active), `workouts` (plan days), `workout_exercises`, `workout_sessions`, `session_exercises` (snapshot of the prescription so history stays correct after the plan adapts), `exercise_sets`, `progress_records` (weight history — the only place body weight is stored), `body_measurements`, `ai_conversations`, `ai_messages`, `ai_recommendations` (audit log of every AI/engine recommendation, including rejected AI output and the reasons). See `apps/api/src/db/migrations`.

## Learn the movement & camera form check

**A demonstration plays on every exercise card during a workout** (and on each exercise page), best source first:
- **Reviewed video**, if one has been added to `apps/api/src/db/seed/exerciseVideos.ts` (YouTube via the privacy-enhanced `youtube-nocookie.com` player, or a direct video file you're licensed to use). The list ships **empty on purpose**: only add videos a qualified person has checked, because a bad demo teaches bad form. Re-run `npm run db:seed` (or restart `npm run dev`) after editing.
- **Demonstration photos** for 84 of the 91 exercises. They alternate between the start and end positions and are not real video. They come from the public-domain [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (Unlicense), resized into `apps/web/public/demos/`. Every mapping was checked by eye. Eleven show a close variation (e.g. cable instead of band), and the caption says what differs (`apps/web/src/features/formcheck/demoPhotos.ts`).
- **Animated figure** for the 7 exercises without photos: jumping jacks, step jacks, high knees, burpee, bird dog, pike push-up and shadow boxing (`figures.ts`).
- **Animated form guide**: a stick-figure version of every camera-checked movement, showing what the camera looks for. Tests run each guide through the form analyzer, so the demo always passes its own check.
- A **"Find demonstration videos"** link opens a YouTube search, clearly labelled as unreviewed.

**Live camera form check** ("Check my form" during a workout, or "Practice with camera" on the exercise page):
- Pose detection runs **on the device** with [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (Apache-2.0). **Video never leaves the device**; only rep counts and issue counts are saved (`form_checks` table).
- It counts reps (or times holds) and flags issues per movement — e.g. knees caving in on squats, sagging hips on push-ups/planks, leaning back on overhead presses, swinging on curls. **Injury-risk issues are shown in red and spoken aloud**; form issues in amber; tips in blue. The camera's rep count can be applied to the set log in one tap.
- Repeated injury-risk issues become a safety insight on the home screen, and the AI coach sees recent form-check results.
- Supported: 47 of the 91 library exercises across squat, lunge, push-up, hip hinge (RDL, swing, pull-through), overhead press, curl, lateral raise, plank, glute bridge, row, pull-up/pulldown, triceps pushdown, overhead triceps extension, bench dip and side plank (`packages/shared/src/formcheck.ts`). Other exercise cards say why there's no check, such as lying on a bench, a machine hiding the body, errors that happen toward the camera, or carries leaving the frame (`apps/web/src/features/formcheck/coverage.ts`).

**Limits (shown in the app):** a single camera sees in 2D. Thresholds are coaching heuristics, not clinical measurements. Some risks can't be judged reliably — notably lower-back rounding — so the app says so instead of guessing; conventional deadlifts aren't camera-checked for that reason. It's guidance, not a substitute for a coach or physiotherapist.

**Assets:** `npm run dev`/`build` run `apps/web/scripts/setup-mediapipe.mjs`, which copies the WebAssembly runtime from `node_modules` and downloads the 5.8 MB pose model into `apps/web/public/mediapipe/` (git-ignored). If the download isn't possible, the app loads the model from Google's model storage at runtime.

**On a phone:** browsers only allow the camera on HTTPS pages or `localhost`. Run `npm run dev:phone` and open the `https://<your-computer-ip>:5173` address it prints on your phone (same Wi-Fi), accepting the self-signed certificate warning once.

## Accounts and email

**No sign-up to start.** "Get started" creates a guest account (no email or password); the session cookie lasts a year and is refreshed on each visit. Guests can add an email and password any time in Profile ("Save your progress") to keep their data and log in elsewhere. Logging out of a guest account warns first, since the data can't be recovered without credentials. Guest accounts that never finish onboarding are deleted after 7 days of inactivity.

Sessions are JWTs that carry a per-user `session_version`; changing or resetting a password, or "sign out everywhere", bumps the version and every older token stops working. Reset and verification links are random 256-bit tokens; only their SHA-256 hash is stored, they are single-use, and requesting a new one revokes the old. `forgot-password` responds identically whether or not the email exists.

Email goes through the `Mailer` interface (`apps/api/src/lib/mailer.ts`). In development the **console mailer** logs emails instead of sending them, and `GET /dev/mail` exposes them (development only, used by the e2e tests). In production the default is `disabled`, and the reset/verification endpoints return `503` rather than pretending to send — **plug in a real provider before launch.**

## Design decisions worth knowing

- **Streaks are counted in weeks** (consecutive weeks hitting the weekly target). A day streak would penalise planned rest days.
- **Calories are a rough estimate** (MET 3.5 × body weight × training time) and labelled as such; there is no wearable integration.
- **BMI** uses WHO adult cut-offs and shows no category under 18.
- **Suggested weights start empty**: the first session calibrates them from what the user logs.

## Known limitations

- The Anthropic provider is type-checked against the SDK and the whole AI pipeline is tested with fake providers, but it has not yet been exercised against the live API in this repository's test suite (it needs `ANTHROPIC_API_KEY`).
- The camera form check is validated with synthetic movement sequences and a real photo through the actual MediaPipe model in Chromium, but not yet with recorded videos of people training; thresholds may need tuning from real-world use.
- The reviewed-video list is empty until someone qualified adds videos.
- The web client is a responsive web app; there is no native (Flutter) client yet. The REST API supports Bearer tokens for one.
- No real email provider is implemented yet (see "Accounts and email").
- Single-language (English), metric units only.

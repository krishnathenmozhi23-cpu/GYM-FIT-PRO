import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "./components/AppShell";
import { LoadingState } from "./components/ui";
import { AuthProvider, useAuth } from "./state/auth";
import { ErrorBoundary } from "./components/ErrorBoundary";

const AuthPage = lazy(() => import("./features/auth/AuthPage").then((m) => ({ default: m.AuthPage })));
const OnboardingPage = lazy(() => import("./features/onboarding/OnboardingPage").then((m) => ({ default: m.OnboardingPage })));

const HomePage = lazy(() => import("./features/home/HomePage"));
const WorkoutsPage = lazy(() => import("./features/workouts/WorkoutsPage"));
const WorkoutDetailPage = lazy(() => import("./features/workouts/WorkoutDetailPage"));
const SessionPage = lazy(() => import("./features/session/SessionPage"));
const ExplorePage = lazy(() => import("./features/explore/ExplorePage"));
const ProgressPage = lazy(() => import("./features/progress/ProgressPage"));
const ProfilePage = lazy(() => import("./features/profile/ProfilePage"));
const ExerciseDetailPage = lazy(() => import("./features/explore/ExerciseDetailPage"));

function RequireAuth({ children, allowIncomplete = false }: { children: ReactNode; allowIncomplete?: boolean }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allowIncomplete && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingState />;
  if (user) return <Navigate to={user.onboardingCompleted ? "/" : "/onboarding"} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
              <Route path="/onboarding" element={<RequireAuth allowIncomplete><OnboardingPage /></RequireAuth>} />
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route index element={<HomePage />} />
                <Route path="workouts" element={<WorkoutsPage />} />
                <Route path="workout/:id" element={<WorkoutDetailPage />} />
                <Route path="explore" element={<ExplorePage />} />
                <Route path="explore/:id" element={<ExerciseDetailPage />} />
                <Route path="progress" element={<ProgressPage />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>
              <Route
                path="/session/:id"
                element={
                  <RequireAuth>
                    <div className="app-shell" style={{ paddingBottom: 32 }}>
                      <SessionPage />
                    </div>
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

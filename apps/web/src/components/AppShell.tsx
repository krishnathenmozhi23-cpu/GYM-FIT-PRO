import { Suspense, lazy, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { BarChart3, Compass, Dumbbell, Home, MessageCircle, User } from "lucide-react";
import { LoadingState } from "./ui";

const AssistantSheet = lazy(() => import("../features/assistant/AssistantSheet"));

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/profile", label: "Profile", icon: User },
];

export function AppShell() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  return (
    <div className="app-shell">
      <main>
        <Suspense fallback={<LoadingState />}>
          <Outlet context={{ openAssistant: () => setAssistantOpen(true) }} />
        </Suspense>
      </main>
      <button className="fab" aria-label="Open AI assistant" onClick={() => setAssistantOpen(true)}>
        <MessageCircle size={26} />
      </button>
      <nav className="bottom-nav" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
      {assistantOpen && (
        <Suspense fallback={null}>
          <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

export interface ShellContext {
  openAssistant: () => void;
}

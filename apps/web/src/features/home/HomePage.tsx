import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { Profile } from "@gymfit/shared";
import { ErrorState, LoadingState } from "../../components/ui";

export default function HomePage() {
  const { data, error, loading, reload } = useAsync(() => api.get<{ profile: Profile }>("/profile"));
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="page">
      <h1 className="page-title">Hi, {data?.profile.name}</h1>
    </div>
  );
}

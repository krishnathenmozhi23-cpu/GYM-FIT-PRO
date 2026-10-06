import { Sheet } from "../../components/ui";

export default function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="AI Coach">
      <p className="muted">Assistant arrives in Phase 4.</p>
    </Sheet>
  );
}

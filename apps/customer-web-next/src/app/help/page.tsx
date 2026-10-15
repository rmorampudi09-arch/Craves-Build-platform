import { HelpSupport } from "@/features/support/screens/HelpSupport";
import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";

export const metadata = {
  title: "Help & support | Craves",
  description: "Chat, call or email Craves, and find answers to common questions.",
};

export default function HelpPage() {
  return (
    <ContextualBackBoundary destination="/help" fallback="/profile">
      <HelpSupport />
    </ContextualBackBoundary>
  );
}

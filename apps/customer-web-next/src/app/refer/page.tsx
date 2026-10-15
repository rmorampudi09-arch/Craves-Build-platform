import { ReferFriend } from "@/features/profile/screens/ReferFriend";
import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";

export const metadata = {
  title: "Refer a friend | Craves",
  description: "Share Craves with someone you know.",
};

export default function ReferPage() {
  return (
    <ContextualBackBoundary destination="/refer" fallback="/profile">
      <ReferFriend />
    </ContextualBackBoundary>
  );
}

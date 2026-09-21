"use client";

import { BottomNav } from "@/components/layout/BottomNav";
import ProfilePage from "@/screens/Profile/Profile";

export default function ProfileRoutePage() {
  return (
    <div className="pb-20 md:pb-0">
      <ProfilePage />
      <BottomNav />
    </div>
  );
}

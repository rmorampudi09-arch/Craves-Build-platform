import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import cravesLogo from "@/assets/images/craves-logo.png";
import { assetUrl } from "@/lib/asset-url";

/** Simple back + logo + "My Profile" header. */
export function ProfileHeader() {
  return (
    <header className="border-b border-border bg-cream/90">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
        <Link to="/home" className="rounded-full p-2 hover:bg-black/5" aria-label="Back to home">
          <ArrowLeft className="h-5 w-5 text-ink" />
        </Link>
        <Link to="/home" className="flex items-center gap-2">
          <img src={assetUrl(cravesLogo)} alt="Craves" width={36} height={36} className="h-9 w-9" />
          <span className="font-display text-lg font-bold text-primary">MY Profile</span>
        </Link>
      </div>
    </header>
  );
}

export default ProfileHeader;

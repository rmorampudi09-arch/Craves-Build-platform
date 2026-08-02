import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";

interface ProfileLinkCardProps {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

/** Tappable row: icon, title, subtitle, chevron — used for "My wishlist" and "My orders". */
export function ProfileLinkCard({ to, icon: Icon, title, subtitle }: ProfileLinkCardProps) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 hover:border-primary"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </Link>
  );
}

export default ProfileLinkCard;

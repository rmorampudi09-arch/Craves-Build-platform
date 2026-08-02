import { Mail, Pencil, Phone, User } from "lucide-react";
import type { CustomerProfile } from "@/lib/profile-contract";
import type { CravesUser } from "@/services/auth/cravesAuth";
export function AccountCard({ user, profile, onEdit }: { user: CravesUser; profile: CustomerProfile | null; onEdit: () => void }) {
  const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : user.username;
  return <section className="overflow-hidden rounded-2xl p-6 text-white" style={{ background: "var(--gradient-primary)" }}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur"><User className="h-8 w-8" /></div><div><h1 className="font-display text-2xl font-bold">{name}</h1><p className="mt-1 flex items-center gap-1.5 text-sm text-white/90"><Phone className="h-3.5 w-3.5" /> {profile?.registeredPhoneNumber || user.phoneNumber}</p>{profile?.email && <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80"><Mail className="h-3 w-3" /> {profile.email}</p>}{profile?.createdAt && <p className="mt-1 text-[11px] text-white/70">Member since {new Date(profile.createdAt).toLocaleDateString("en-IN")}</p>}</div></div><button type="button" onClick={onEdit} className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/30"><Pencil className="h-3.5 w-3.5" /> Edit</button></div></section>;
}
export default AccountCard;

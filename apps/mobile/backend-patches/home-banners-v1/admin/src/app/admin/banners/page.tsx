import { AdminHomeBanners } from "@/components/admin-home-banners";

export const metadata = { title: "Home banners | Craves Admin", robots: { index: false, follow: false } };

export default function AdminBannersPage() {
  return <div className="space-y-7">
    <header><h1 className="text-2xl font-bold text-zinc-900">Home banners</h1></header>
    <AdminHomeBanners />
  </div>;
}

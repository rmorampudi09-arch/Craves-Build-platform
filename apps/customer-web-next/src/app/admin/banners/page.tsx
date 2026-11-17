import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";
import { AdminHomeBanners } from "@/features/admin/banners/components/admin-home-banners";

export const metadata = { title: "Home banners | Craves Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminBannersPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Website and app" title="Home banners" description="Website banners show on the website's home page; app banners show in the app's home screen carousel. Each has its own uploads, order and Published switch. Catalog Service enforces the platform administrator role on every change." />
    <AdminHomeBanners />
  </div>;
}

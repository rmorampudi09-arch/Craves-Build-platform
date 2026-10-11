import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";
import { AdminHomeBanners } from "@/features/admin/banners/components/admin-home-banners";

export const metadata = { title: "Home banners | Craves Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminBannersPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Mobile app" title="Home banners" description="Images shown in the customer app's home screen carousel. Upload an image, tick Published to show it, or delete it. Catalog Service enforces the platform administrator role on every change." />
    <AdminHomeBanners />
  </div>;
}

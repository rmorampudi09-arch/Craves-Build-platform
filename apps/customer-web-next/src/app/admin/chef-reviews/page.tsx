import { AdminChefReviewList } from "@/components/admin-chef-review-list";

export const metadata = { title: "Chef applications | Craves Admin", robots: { index: false, follow: false } };

export default function AdminChefReviewsPage() {
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 sm:px-8">
    <a href="/admin" className="text-sm font-semibold text-[#F6B545]">← Administration</a>
    <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">Chef onboarding</p>
    <h1 className="mt-4 text-4xl font-bold text-white sm:text-6xl">Chef application review.</h1>
    <p className="mt-5 max-w-3xl text-slate-300">Inspect the applicant profile and private proof files before recording an audited approval or rejection.</p>
    <div className="mt-10"><AdminChefReviewList /></div>
  </main>;
}

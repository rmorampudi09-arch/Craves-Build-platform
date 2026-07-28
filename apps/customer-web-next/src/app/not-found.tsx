export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12 text-center">
      <section className="w-full rounded-[30px] bg-[#FFF8EC] p-8 text-slate-950 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">Not found</p>
        <h1 className="mt-3 text-3xl font-bold">This tracking page is not available.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">Check the chef-specific order ID and try again from your order history.</p>
        <a className="mt-7 inline-flex rounded-full bg-[#6930CA] px-5 py-3 text-sm font-semibold text-white" href="/">Return home</a>
      </section>
    </main>
  );
}

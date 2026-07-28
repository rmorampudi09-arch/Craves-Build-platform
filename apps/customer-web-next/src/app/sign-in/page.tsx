export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12 text-center">
      <section className="w-full rounded-[30px] bg-[#FFF8EC] p-8 text-slate-950 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">Authentication module pending</p>
        <h1 className="mt-3 text-3xl font-bold">Sign in through the existing Craves authentication flow.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">The production phone-OTP/password migration will set the secure <code>craves_access_token</code> HTTP-only cookie used by this tracking module. No token entry form is exposed here.</p>
        <a className="mt-7 inline-flex rounded-full border border-[#6930CA] px-5 py-3 text-sm font-semibold text-[#6930CA]" href="/">Return home</a>
      </section>
    </main>
  );
}

import Link from "next/link";

// Says why (an old or mistyped link) and offers the places people were most likely headed.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-bold text-[#1A1A1A]">We couldn’t find this page</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
          The link may be old or mistyped, or the dish or kitchen is no longer listed. Pick up from
          one of these instead.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link href="/home" className="craves-primary-action">
            Browse dishes
          </Link>
          <div className="flex flex-wrap justify-center gap-x-5">
            <Link href="/orders" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A1A1A] underline underline-offset-4">
              Your orders
            </Link>
            <Link href="/support" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A1A1A] underline underline-offset-4">
              Chat with support
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

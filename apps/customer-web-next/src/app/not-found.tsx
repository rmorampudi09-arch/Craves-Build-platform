import Link from "next/link";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";

// Says why (an old or mistyped link) and offers the places people were most likely headed.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <EmptyState
          illustration="notFound"
          heading="h1"
          title="We couldn’t find this page"
          message="The link may be old or mistyped, or the dish or kitchen is no longer listed. Pick up from one of these instead."
          className="py-0 md:py-0"
        >
          <Link href="/home" className="craves-primary-action">
            Browse dishes
          </Link>
        </EmptyState>
        <div className="mt-4 flex flex-wrap justify-center gap-x-5">
          <Link href="/orders" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A1A1A] underline underline-offset-4">
            My Orders
          </Link>
          <Link href="/support" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1A1A1A] underline underline-offset-4">
            Chat with support
          </Link>
        </div>
      </div>
    </main>
  );
}

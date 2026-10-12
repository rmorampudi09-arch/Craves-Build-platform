import { CustomerRouteSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

/** Shown the moment navigation starts, shaped like the page that is coming. */
export default function Loading() {
  return (
    <CustomerRouteSkeleton
      title="Your orders"
      backHref="/profile"
      backLabel="Back to profile"
      variant="orders"
      label="Loading your orders"
      width="max-w-4xl"
    />
  );
}

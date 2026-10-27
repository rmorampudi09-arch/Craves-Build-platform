import { CustomerRouteSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

/** Shown the moment navigation starts, shaped like the page that is coming. */
export default function Loading() {
  return (
    <CustomerRouteSkeleton
      title="My Orders"
      backHref="/profile"
      backLabel="Back to profile"
      variant="orders"
      label="Loading your orders"
    />
  );
}

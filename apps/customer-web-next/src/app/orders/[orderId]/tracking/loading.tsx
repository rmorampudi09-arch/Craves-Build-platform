import { CustomerRouteSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

/** Shown the moment navigation starts, shaped like the page that is coming. */
export default function Loading() {
  return (
    <CustomerRouteSkeleton
      title="Track order"
      backHref="/orders"
      backLabel="Back to orders"
      variant="tracking"
      label="Loading order tracking"
    />
  );
}

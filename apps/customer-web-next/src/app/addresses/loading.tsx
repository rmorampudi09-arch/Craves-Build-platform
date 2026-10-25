import { CustomerRouteSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

/** Shown the moment navigation starts, shaped like the page that is coming. */
export default function Loading() {
  return (
    <CustomerRouteSkeleton
      title="Delivery addresses"
      backHref="/profile"
      backLabel="Back to profile"
      variant="addresses"
      label="Loading saved addresses"
    />
  );
}

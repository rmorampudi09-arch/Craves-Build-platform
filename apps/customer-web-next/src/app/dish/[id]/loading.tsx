import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";

/** Shown the moment navigation starts, shaped like the page that is coming. */
export default function Loading() {
  return <CustomerPageSkeleton variant="dish" label="Loading live dish details" />;
}

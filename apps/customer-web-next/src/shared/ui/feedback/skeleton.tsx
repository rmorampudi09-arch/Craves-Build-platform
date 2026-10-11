import { cn } from "@/shared/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-[#F1F3F5]", className)} {...props} />;
}

export { Skeleton };

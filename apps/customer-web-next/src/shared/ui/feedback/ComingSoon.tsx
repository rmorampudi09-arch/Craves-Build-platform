import { Badge } from "@/shared/ui/feedback/badge";
import { Card } from "@/shared/ui/data-display/card";

/** Shown where the backend route isn't live yet (the BFF answered FEATURE_NOT_AVAILABLE). */
export function ComingSoon({ title, message }: { title: string; message?: string }) {
  return (
    <Card role="status" className="p-5">
      <Badge variant="secondary">Coming soon</Badge>
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
    </Card>
  );
}

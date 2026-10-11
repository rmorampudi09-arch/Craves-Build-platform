"use client";
import { AcademyErrorState } from "../../../features/admin/academy/academy-ui";
import "../../../features/admin/academy/academy.css";
export default function AcademyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="ca-root"><AcademyErrorState error={error} onRetry={reset} />{error.digest && <p className="ca-error-reference">Support reference: {error.digest}</p>}</div>;
}

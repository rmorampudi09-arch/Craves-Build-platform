"use client";
import { AcademyErrorState } from "./academy-ui";
import "./academy.css";
export default function AcademyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="ca-root"><AcademyErrorState error={error} onRetry={reset} />{error.digest && <p className="ca-error-reference">Support reference: {error.digest}</p>}</div>;
}

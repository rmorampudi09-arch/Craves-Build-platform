/** Synchronous guard: React's next render must not be the first duplicate-submit barrier. */
export function createOperationGate() {
  let entered = false;
  return {
    enter(): boolean { if (entered) return false; entered = true; return true; },
    leave(): void { entered = false; }
  };
}
/** A denial of today's retry does not prove that yesterday's uncertain write never committed. */
export function mayDiscardRejectedAttempt(recovering: boolean, status: number, uncertain: boolean): boolean {
  return !recovering && !uncertain && Number.isInteger(status) && status >= 400 && status < 500;
}

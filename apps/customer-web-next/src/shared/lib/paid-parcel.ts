// The parcel after payment (the order page's leaf animation) plays only when this tab's checkout verified the
// payment with Razorpay: a typed, bookmarked or shared ?paid=1 link, a failed or a closed payment never shows "Paid".
// One sessionStorage entry per order: "due" once checkout confirms the payment, "played" once the parcel has shown.

const key = (orderId: string) => `craves.paid-parcel.${orderId}`;

function write(orderId: string, value: "due" | "played"): void {
  try {
    window.sessionStorage.setItem(key(orderId), value);
  } catch {
    // Storage blocked: the page simply opens without the parcel.
  }
}

/** Checkout calls this only after Razorpay's success was verified as PAID. */
export function markPaidParcelDue(orderId: string): void {
  write(orderId, "due");
}

/** True while a verified payment's parcel hasn't played in this tab yet. */
export function paidParcelDue(orderId: string): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(key(orderId)) === "due";
  } catch {
    return false;
  }
}

/** Once shown, a reload, Back/Forward or a later visit opens the page at once. */
export function markPaidParcelPlayed(orderId: string): void {
  write(orderId, "played");
}

// How an order's progress is worded for the customer: the kitchen, and the cook by name when the
// kitchen's name gives it ("Waiting for Lakshmi to confirm", "Lakshmi is cooking your order"; owner,
// 5 Nov 2026). Browser- and Node-safe (the order libs import it with a relative path).

/** "Lakshmi" from "Lakshmi's Kitchen"; null when the kitchen's name doesn't say who cooks. */
export function cookName(kitchenName: string): string | null {
  return /^(.+?)['’]s\b/.exec(kitchenName.trim())?.[1] ?? null;
}

export function orderWords(kitchenName: string) {
  const cook = cookName(kitchenName);
  const who = cook ?? "The kitchen";
  return {
    waiting: `Waiting for ${cook ?? "the kitchen"} to confirm`,
    waitingDetail: `${who} will confirm your order shortly.`,
    accepted: `${who} accepted`,
    cooking: `${who} is cooking your order`,
  };
}

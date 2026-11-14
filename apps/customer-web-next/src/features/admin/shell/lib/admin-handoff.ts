/**
 * Text typed in the admin search box, handed to the page it opens. It stays in memory, never in the URL,
 * because it can be a name or a phone number. Reading it twice is safe (React may render twice).
 */
export type HandOffPage = "customers" | "riders" | "kitchens";

let pending: { page: HandOffPage; text: string; at: number } | null = null;

export function handOff(page: HandOffPage, text: string) {
  pending = { page, text: text.trim().slice(0, 80), at: Date.now() };
}

/** The text handed to this page in the last few seconds, or "". */
export function handedTo(page: HandOffPage): string {
  return pending && pending.page === page && Date.now() - pending.at < 10_000 ? pending.text : "";
}

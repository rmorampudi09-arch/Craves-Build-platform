/**
 * The chef's own name, from the chef application. Chef Mode greets and labels the chef with it,
 * never with the customer profile or the phone number. Kept per tab and only for its own user.
 */
const KEY = "craves.chef-name";

export type ChefName = { userId: string; firstName: string; lastName: string };

let current: ChefName | null = null;
const listeners = new Set<() => void>();

function read(): ChefName | null {
  if (current || typeof window === "undefined") return current;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Partial<ChefName> | null;
    if (typeof stored?.userId === "string" && typeof stored.firstName === "string")
      current = { userId: stored.userId, firstName: stored.firstName, lastName: typeof stored.lastName === "string" ? stored.lastName : "" };
  } catch {
    // Blocked storage: the name arrives with the next access check.
  }
  return current;
}

export function rememberChefName(userId: string, application: { firstName: string | null; lastName: string | null }): void {
  const next = { userId, firstName: application.firstName?.trim() ?? "", lastName: application.lastName?.trim() ?? "" };
  if (current?.userId === next.userId && current.firstName === next.firstName && current.lastName === next.lastName) return;
  current = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The name still shows for this page view.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeChefName(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** This user's chef name, or null while it is unknown. Stable between changes (useSyncExternalStore). */
export function getChefName(userId: string | null | undefined): ChefName | null {
  const name = read();
  return name && name.userId === userId ? name : null;
}

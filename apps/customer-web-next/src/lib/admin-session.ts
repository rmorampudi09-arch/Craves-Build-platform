import { parseAdminIdentity, type AdminIdentity } from "./admin-contract.ts";

type Fetcher = typeof fetch;

export class AdminSessionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminSessionError";
    this.status = status;
  }
}

async function readAdminIdentity(fetcher: Fetcher): Promise<{ response: Response; body: unknown }> {
  const response = await fetcher("/api/admin/me", { cache: "no-store", credentials: "same-origin" });
  return { response, body: await response.json().catch(() => null) };
}

export async function loadAdminIdentity(fetcher: Fetcher = fetch): Promise<AdminIdentity> {
  let result = await readAdminIdentity(fetcher);

  if (result.response.status === 401) {
    const refresh = await fetcher("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
    if (refresh.ok) result = await readAdminIdentity(fetcher);
  }

  if (result.response.status === 401) {
    throw new AdminSessionError("Sign in with an administrator account.", 401);
  }
  if (result.response.status === 403) {
    throw new AdminSessionError("This account does not have administrator access.", 403);
  }
  if (!result.response.ok) {
    throw new AdminSessionError("Administrator identity is temporarily unavailable.", result.response.status);
  }

  const identity = parseAdminIdentity(result.body);
  if (!identity?.adminEnabled) {
    throw new AdminSessionError("This account does not have administrator access.", 403);
  }
  return identity;
}

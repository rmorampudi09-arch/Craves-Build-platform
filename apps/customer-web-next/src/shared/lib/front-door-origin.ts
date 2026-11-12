// Answer only our Azure Front Door.
//
// The web and admin container apps (craves.in, www, admin.craves.in) accept Azure Front Door's shared address
// ranges, so any company's Front Door profile could send traffic to them and skip our WAF. Our profile,
// afd-craves-prod, stamps every request with X-Azure-FDID: <its id>, and Front Door overwrites any value a client
// sends, so the app can trust the header. The id is not a secret.
//
// Settings (docs/runbooks/production-environment.md):
//   CRAVES_FRONT_DOOR_ID     the expected id
//   CRAVES_FRONT_DOOR_CHECK  "report" or "enforce"; unset or any other value means off
//
// Pure on purpose: src/proxy.ts does the logging and the 403.

export type FrontDoorOriginDecision = "allow" | "report" | "deny";

/** process.env, or a plain object in tests. Only CRAVES_FRONT_DOOR_ID and CRAVES_FRONT_DOOR_CHECK are read. */
export type FrontDoorOriginEnv = Readonly<Record<string, string | undefined>>;

/** Next lowercases header names. */
export const FRONT_DOOR_ID_HEADER = "x-azure-fdid";

function checkMode(env: FrontDoorOriginEnv): "off" | "report" | "enforce" {
  const mode = env.CRAVES_FRONT_DOOR_CHECK;
  return mode === "report" || mode === "enforce" ? mode : "off";
}

// Whitespace around the setting is dropped, so a pasted newline cannot turn enforce into "deny everyone".
function expectedId(env: FrontDoorOriginEnv): string {
  return env.CRAVES_FRONT_DOOR_ID?.trim() ?? "";
}

/**
 * A check mode is set but the id is empty. The check then allows every request (fail open: a missing setting must
 * never take the site down), and the caller logs ORIGIN_CHECK_MISCONFIGURED once per process.
 */
export function frontDoorCheckMisconfigured(env: FrontDoorOriginEnv): boolean {
  return checkMode(env) !== "off" && expectedId(env) === "";
}

/** "allow" when the check is off, misconfigured, or the header equals the id exactly; otherwise "report" or "deny" by mode. */
export function frontDoorOriginDecision(fdidHeader: string | null, env: FrontDoorOriginEnv): FrontDoorOriginDecision {
  const mode = checkMode(env);
  const id = expectedId(env);
  if (mode === "off" || id === "" || fdidHeader === id) return "allow";
  return mode === "enforce" ? "deny" : "report";
}

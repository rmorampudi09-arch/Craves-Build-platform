/** Sign-in belongs to the main web application, outside this app's basePath. */
export function adminSignInUrl(origin: string): string {
  const target = new URL("/sign-in", origin);
  target.searchParams.set("returnTo", "/delivery-intelligence");
  return target.href;
}

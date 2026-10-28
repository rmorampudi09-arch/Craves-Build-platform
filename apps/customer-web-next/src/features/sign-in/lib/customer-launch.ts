// Customer launch lock (11 Oct 2026): Craves onboards home chefs first.
// While true, the landing sign-in popup shows customers a "launching soon" note (Home Chef works as before)
// and /sign-in shows the same note unless opened with the private early-access link. "Switch to customer app" in
// Chef Mode opens that note (?from=chef) instead of the customer app, and the chef stays in Chef Mode. A chef
// (applicants included, once they used Chef Mode on the device) who opens a customer page in a new tab sees it too.
// To restore exactly as it was: revert the lock PRs (newest first: the new-tab one, #477, #476), or compare with the
// git tag restore/customer-sign-in-2026-10-11. Setting this to false also reopens customer sign-in and the chef switch.
// Owners (ADMIN) are the exception: signed in through the early-access link, or switching from Chef Mode, they get the
// customer app, so they can check it before the launch.
export const CUSTOMERS_LAUNCHING_SOON = true;

/** Only the Craves owners have ADMIN; the launch lock lets them into the customer app. */
export function isCravesOwner(roles: readonly string[] | undefined): boolean {
  return Boolean(roles?.some((role) => role.toUpperCase() === "ADMIN"));
}

// SHA-256 of the private key in craves.in/sign-in?access=<key>. The key itself is never stored in the repo.
export const CUSTOMER_EARLY_ACCESS_SHA256 = "1010d988b8d904ef6aa447d388cf84fbb1354b05f31bbd9f1637ba5ddcd3185b";

export const CUSTOMERS_LAUNCHING_SOON_COPY = {
  title: "Craves is launching soon for customers",
  body: "We're welcoming our home chefs first. Ordering opens for everyone very soon.",
  chef: "Join as a Home Chef",
  backToKitchen: "Back to my kitchen",
} as const;

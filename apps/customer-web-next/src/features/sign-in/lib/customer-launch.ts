// Customer launch lock (11 Oct 2026): Craves onboards home chefs first.
// While true, the landing sign-in popup shows customers a "launching soon" note (Home Chef works as before)
// and /sign-in shows the same note unless opened with the private early-access link.
// To restore the customer sign-in exactly as it was: revert the PR that added this file, or compare with
// the git tag restore/customer-sign-in-2026-10-11. Setting this to false also reopens customer sign-in.
export const CUSTOMERS_LAUNCHING_SOON = true;

// SHA-256 of the private key in craves.in/sign-in?access=<key>. The key itself is never stored in the repo.
export const CUSTOMER_EARLY_ACCESS_SHA256 = "1010d988b8d904ef6aa447d388cf84fbb1354b05f31bbd9f1637ba5ddcd3185b";

export const CUSTOMERS_LAUNCHING_SOON_COPY = {
  title: "Craves is launching soon for customers",
  body: "We're welcoming our home chefs first. Ordering opens for everyone very soon.",
  chef: "Join as a Home Chef",
} as const;

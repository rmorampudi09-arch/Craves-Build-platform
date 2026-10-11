import { ChefSignIn } from "@/features/chef/components/chef-sign-in";
import { safeChefReturnTo } from "@/features/chef/lib/chef-mode";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Chef sign in | Craves",
  robots: { index: false, follow: false },
};

export default async function ChefSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <ChefSignIn
      returnTo={safeChefReturnTo(returnTo)}
      centralOtp={process.env.CRAVES_CENTRAL_OTP_ENABLED === "true"}
    />
  );
}

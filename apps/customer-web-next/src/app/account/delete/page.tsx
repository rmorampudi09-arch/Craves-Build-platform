import { DeleteAccountScreen } from "@/features/account-deletion/components/delete-account-screen";

export const metadata = {
  title: "Delete account | Craves",
  robots: { index: false, follow: false },
};

export default async function DeleteAccountPage({ searchParams }: { searchParams: Promise<{ side?: string | string[] }> }) {
  const { side } = await searchParams;
  return <DeleteAccountScreen side={side === "chef" || side === "customer" ? side : null} />;
}

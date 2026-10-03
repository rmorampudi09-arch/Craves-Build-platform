import AllChefsPage from "@/screens/public/AllChefs/AllChefs";

export const metadata = {
  title: "Home chefs near you | Craves",
  description: "Discover trusted home chefs and nearby kitchens through Craves.",
  robots: { index: true, follow: true },
};

export default function ChefsRoutePage() {
  return <AllChefsPage />;
}

import AllChefsPage from "@/features/chefs/screens/AllChefs";

export const metadata = {
  title: "Home chefs near you | Craves",
  description: "Meet verified home chefs cooking fresh homemade food near you in Hyderabad and Bangalore. See their menus, ratings and reviews on Craves.",
  robots: { index: true, follow: true },
};

export default function ChefsRoutePage() {
  return <AllChefsPage />;
}

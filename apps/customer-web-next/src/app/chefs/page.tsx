import AllChefsPage from "@/screens/public/AllChefs/AllChefs";

export const metadata = {
  title: "Home chefs near you | Craves",
  robots: { index: false, follow: false },
};

export default function ChefsRoutePage() {
  return <AllChefsPage />;
}

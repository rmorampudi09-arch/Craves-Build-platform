import type { Metadata } from "next";
import CheckoutScreen from "@/screens/Checkout/Checkout";

export const metadata: Metadata = { title: "Checkout | Craves" };

export default function CheckoutPage() {
  return <CheckoutScreen />;
}

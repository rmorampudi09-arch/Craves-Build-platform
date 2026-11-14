import MyGroupOrders from "@/features/group-orders/screens/MyGroupOrders";

export const metadata = {
  title: "Group orders | Craves",
  robots: { index: false, follow: false },
};

export default function GroupOrdersRoutePage() {
  return <MyGroupOrders />;
}

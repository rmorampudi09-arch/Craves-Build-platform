import { redirect } from "next/navigation";

/** Photos are added and reordered on each dish in the menu, so older links open the menu itself. */
export default function ChefMenuMediaCompatibilityPage() {
  redirect("/chef/menu");
}

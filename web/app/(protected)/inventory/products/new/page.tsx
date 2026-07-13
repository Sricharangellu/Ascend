import { redirect } from "next/navigation";

// Product creation lives on the catalog page (New Product modal).
export default function LegacyNewProductRedirect() {
  redirect("/catalog?new=1");
}

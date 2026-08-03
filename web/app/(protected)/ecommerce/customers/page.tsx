import { redirect } from "next/navigation";

/** Was a re-export of /customers — redirect instead of pretending to be ecommerce. */
export default function EcommerceCustomersAliasRedirect() {
  redirect("/customers");
}
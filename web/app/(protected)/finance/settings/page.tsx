import { redirect } from "next/navigation";

/** Misleading finance settings alias → global Settings. */
export default function FinanceSettingsAliasRedirect() {
  redirect("/settings");
}

import { redirect } from "next/navigation";

/** Finance AP tab used to hijack into this alias — canonical list is /bills. */
export default function FinanceBillsAliasRedirect() {
  redirect("/bills");
}

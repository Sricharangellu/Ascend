import { redirect } from "next/navigation";

/**
 * Never a real AP payment ledger — was a path sniff back into Finance AP.
 * Send users to the canonical Bills list.
 */
export default function FinancePaymentMadeAliasRedirect() {
  redirect("/bills");
}

import { redirect } from "next/navigation";

/** Alias of the POS register — keep URL bookmarks working. */
export default function SellAliasRedirect() {
  redirect("/terminal");
}

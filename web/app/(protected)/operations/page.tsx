import { redirect } from "next/navigation";

/** Legacy /operations — Outlets live at /setup/outlets (Wave 3). */
export default function OperationsRedirect() {
  redirect("/setup/outlets");
}

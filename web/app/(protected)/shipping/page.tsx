import { redirect } from "next/navigation";

/** Legacy /shipping — shipment registry lives on Delivery → Shipments (Wave 2). */
export default function ShippingPage() {
  redirect("/delivery?tab=shipments");
}

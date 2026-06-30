import { http, HttpResponse, delay } from "msw";

const V1 = "*/api/v1";
const lat = () => delay(Math.floor(Math.random() * 100) + 40);
const rid = () => `mock-${Math.random().toString(36).slice(2, 10)}`;
const now = () => Date.now();
const day = 86_400_000;

function badRequest(code: string, message: string, status = 400) {
  return HttpResponse.json({ error: { code, message, requestId: rid() } }, { status });
}

type Room = {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  room_number: string;
  type: string;
  floor: string | null;
  rate_cents: number;
  status: "available" | "occupied" | "checkout" | "cleaning" | "maintenance";
  notes: string | null;
  created_at: number;
  updated_at: number;
};

type RoomCharge = {
  id: string;
  tenant_id: string;
  room_id: string;
  order_id: string | null;
  description: string;
  amount_cents: number;
  posted_at: number;
  settled_at: number | null;
  created_at: number;
};

type ProductionOrder = {
  id: string;
  tenant_id: string;
  product_id: string;
  quantity: number;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  started_at: number | null;
  completed_at: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

type BomLine = {
  id: string;
  tenant_id: string;
  production_order_id: string;
  raw_material_id: string;
  qty_required: number;
  qty_consumed: number;
  unit: string;
};

type RentalAsset = {
  id: string;
  tenant_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  daily_rate_cents: number;
  deposit_cents: number;
  status: "available" | "rented" | "maintenance";
  serial_number: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

type RentalContract = {
  id: string;
  tenant_id: string;
  asset_id: string;
  customer_id: string | null;
  starts_at: number;
  ends_at: number;
  deposit_cents: number;
  total_cents: number;
  status: "active" | "returned" | "overdue";
  returned_at: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

type EventRow = {
  id: string;
  tenant_id: string;
  name: string;
  venue: string | null;
  starts_at: number;
  ends_at: number;
  capacity: number;
  sold: number;
  price_cents: number;
  status: "on_sale" | "sold_out" | "cancelled" | "ended";
  description: string | null;
  created_at: number;
  updated_at: number;
};

type TicketRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  customer_id: string | null;
  qr_code: string;
  redeemed_at: number | null;
  created_at: number;
};

type StudentRow = {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  course: string | null;
  enrolled_at: number | null;
  status: "active" | "inactive";
  notes: string | null;
  created_at: number;
  updated_at: number;
};

type FeeRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  description: string;
  amount_cents: number;
  due_date: number | null;
  paid_at: number | null;
  method: string | null;
  order_id: string | null;
  created_at: number;
};

const rooms = new Map<string, Room>([
  ["room_101", { id: "room_101", tenant_id: "tnt_demo", outlet_id: "otl_hotel", room_number: "101", type: "standard", floor: "1", rate_cents: 12900, status: "available", notes: "Late checkout friendly", created_at: now() - 4 * day, updated_at: now() - 4 * day }],
  ["room_202", { id: "room_202", tenant_id: "tnt_demo", outlet_id: "otl_hotel", room_number: "202", type: "suite", floor: "2", rate_cents: 28900, status: "occupied", notes: "Ocean view", created_at: now() - 7 * day, updated_at: now() - 1 * day }],
  ["room_305", { id: "room_305", tenant_id: "tnt_demo", outlet_id: "otl_hotel", room_number: "305", type: "deluxe", floor: "3", rate_cents: 18900, status: "cleaning", notes: null, created_at: now() - 10 * day, updated_at: now() - 2 * day }],
]);

const roomCharges = new Map<string, RoomCharge[]>([
  ["room_202", [
    { id: "rchg_1", tenant_id: "tnt_demo", room_id: "room_202", order_id: "ord_1001", description: "Mini bar restock", amount_cents: 1800, posted_at: now() - 2 * day, settled_at: null, created_at: now() - 2 * day },
    { id: "rchg_2", tenant_id: "tnt_demo", room_id: "room_202", order_id: null, description: "Spa service", amount_cents: 4500, posted_at: now() - 3 * day, settled_at: now() - 2 * day, created_at: now() - 3 * day },
  ]],
]);

const productionOrders = new Map<string, ProductionOrder>([
  ["prodord_1", { id: "prodord_1", tenant_id: "tnt_demo", product_id: "prod_demo_a", quantity: 48, status: "draft", started_at: null, completed_at: null, notes: "Morning batch", created_at: now() - 5 * day, updated_at: now() - 5 * day }],
  ["prodord_2", { id: "prodord_2", tenant_id: "tnt_demo", product_id: "prod_demo_b", quantity: 120, status: "in_progress", started_at: now() - day, completed_at: null, notes: "Priority wholesale order", created_at: now() - 2 * day, updated_at: now() - day }],
]);

const bomLines = new Map<string, BomLine[]>([
  ["prodord_1", [
    { id: "bom_1", tenant_id: "tnt_demo", production_order_id: "prodord_1", raw_material_id: "raw_tea", qty_required: 2, qty_consumed: 0, unit: "kg" },
    { id: "bom_2", tenant_id: "tnt_demo", production_order_id: "prodord_1", raw_material_id: "raw_filter", qty_required: 1, qty_consumed: 0, unit: "unit" },
  ]],
  ["prodord_2", [
    { id: "bom_3", tenant_id: "tnt_demo", production_order_id: "prodord_2", raw_material_id: "raw_pack", qty_required: 120, qty_consumed: 40, unit: "pack" },
  ]],
]);

const rentalAssets = new Map<string, RentalAsset>([
  ["rasset_1", { id: "rasset_1", tenant_id: "tnt_demo", name: "Power Drill", sku: "RNT-DRILL", category: "Tools", daily_rate_cents: 1500, deposit_cents: 5000, status: "available", serial_number: "PD-1001", notes: "Includes charger", created_at: now() - 12 * day, updated_at: now() - 12 * day }],
  ["rasset_2", { id: "rasset_2", tenant_id: "tnt_demo", name: "Event Tent", sku: "RNT-TENT", category: "Events", daily_rate_cents: 4500, deposit_cents: 15000, status: "rented", serial_number: "ET-400", notes: "Returns by 6pm", created_at: now() - 20 * day, updated_at: now() - day }],
]);

let rentalContracts: RentalContract[] = [
  { id: "rcon_1", tenant_id: "tnt_demo", asset_id: "rasset_2", customer_id: "cus_demo_1", starts_at: now() - 2 * day, ends_at: now() + day, deposit_cents: 15000, total_cents: 9000, status: "active", returned_at: null, notes: "Weekend promo", created_at: now() - 2 * day, updated_at: now() - day },
];

const events = new Map<string, EventRow>([
  ["evt_1", { id: "evt_1", tenant_id: "tnt_demo", name: "Summer Showcase", venue: "Main Hall", starts_at: now() + 7 * day, ends_at: now() + 7 * day + 5 * 3600_000, capacity: 240, sold: 168, price_cents: 3500, status: "on_sale", description: "Multi-act evening event", created_at: now() - 3 * day, updated_at: now() - 3 * day }],
  ["evt_2", { id: "evt_2", tenant_id: "tnt_demo", name: "Members Night", venue: "Room B", starts_at: now() - 2 * day, ends_at: now() - 2 * day + 4 * 3600_000, capacity: 80, sold: 80, price_cents: 2500, status: "sold_out", description: "Small-room ticketing", created_at: now() - 10 * day, updated_at: now() - 2 * day }],
]);

const tickets = new Map<string, TicketRow[]>([
  ["evt_1", [
    { id: "tkt_1", tenant_id: "tnt_demo", event_id: "evt_1", customer_id: "cus_demo_1", qr_code: "evt_1_tkt_1", redeemed_at: null, created_at: now() - day },
    { id: "tkt_2", tenant_id: "tnt_demo", event_id: "evt_1", customer_id: "cus_demo_2", qr_code: "evt_1_tkt_2", redeemed_at: now() - 6 * 3600_000, created_at: now() - 2 * day },
  ]],
  ["evt_2", [
    { id: "tkt_3", tenant_id: "tnt_demo", event_id: "evt_2", customer_id: null, qr_code: "evt_2_tkt_3", redeemed_at: null, created_at: now() - 4 * day },
  ]],
]);

const students = new Map<string, StudentRow>([
  ["stu_1", { id: "stu_1", tenant_id: "tnt_demo", name: "Ava Patel", email: "ava@example.edu", phone: "555-0101", course: "Culinary Arts", enrolled_at: now() - 40 * day, status: "active", notes: "Scholarship pending review", created_at: now() - 40 * day, updated_at: now() - 4 * day }],
  ["stu_2", { id: "stu_2", tenant_id: "tnt_demo", name: "Noah Kim", email: "noah@example.edu", phone: null, course: "Business Basics", enrolled_at: now() - 18 * day, status: "inactive", notes: "Transferred to evening cohort", created_at: now() - 18 * day, updated_at: now() - 2 * day }],
]);

const fees = new Map<string, FeeRow[]>([
  ["stu_1", [
    { id: "fee_1", tenant_id: "tnt_demo", student_id: "stu_1", description: "Tuition installment", amount_cents: 25000, due_date: now() + 10 * day, paid_at: null, method: null, order_id: null, created_at: now() - 2 * day },
    { id: "fee_2", tenant_id: "tnt_demo", student_id: "stu_1", description: "Lab fee", amount_cents: 3500, due_date: now() - 8 * day, paid_at: now() - 7 * day, method: "card", order_id: "ord_1007", created_at: now() - 9 * day },
  ]],
  ["stu_2", [
    { id: "fee_3", tenant_id: "tnt_demo", student_id: "stu_2", description: "Registration fee", amount_cents: 15000, due_date: now() - 5 * day, paid_at: null, method: null, order_id: null, created_at: now() - 6 * day },
  ]],
]);

function studentWithFees(student: StudentRow) {
  const studentFees = fees.get(student.id) ?? [];
  const outstanding = studentFees
    .filter((fee) => !fee.paid_at)
    .reduce((sum, fee) => sum + fee.amount_cents, 0);
  return {
    ...student,
    fees: studentFees,
    outstanding,
  };
}

function roomList(status?: string) {
  const items = [...rooms.values()].sort((a, b) => a.room_number.localeCompare(b.room_number));
  return status ? items.filter((room) => room.status === status) : items;
}

function eventList(status?: string) {
  const items = [...events.values()].sort((a, b) => a.starts_at - b.starts_at).map((event) => ({
    ...event,
    available: Math.max(0, event.capacity - event.sold),
  }));
  return status ? items.filter((event) => event.status === status) : items;
}

function studentList(q?: string, course?: string, status?: string) {
  let items = [...students.values()].sort((a, b) => a.name.localeCompare(b.name)).map(studentWithFees);
  if (q) {
    const search = q.toLowerCase();
    items = items.filter((student) =>
      student.name.toLowerCase().includes(search) ||
      (student.email ?? "").toLowerCase().includes(search)
    );
  }
  if (course) {
    items = items.filter((student) => student.course === course);
  }
  if (status) {
    items = items.filter((student) => student.status === status);
  }
  return items;
}

export const verticalHandlers = [
  http.get(`${V1}/hospitality/rooms`, async ({ request }) => {
    await lat();
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    return HttpResponse.json({ items: roomList(status) });
  }),
  http.post(`${V1}/hospitality/rooms`, async ({ request }) => {
    await lat();
    const body = (await request.json()) as { roomNumber?: string; type?: string; floor?: string; rateCents?: number; notes?: string; outletId?: string };
    if (!body.roomNumber) return badRequest("bad_request", "roomNumber is required");
    const id = `room_${Math.random().toString(36).slice(2, 9)}`;
    const row: Room = {
      id,
      tenant_id: "tnt_demo",
      outlet_id: body.outletId ?? "otl_hotel",
      room_number: body.roomNumber,
      type: body.type ?? "standard",
      floor: body.floor ?? null,
      rate_cents: body.rateCents ?? 0,
      status: "available",
      notes: body.notes ?? null,
      created_at: now(),
      updated_at: now(),
    };
    rooms.set(id, row);
    return HttpResponse.json(row, { status: 201 });
  }),
  http.patch(`${V1}/hospitality/rooms/:id/status`, async ({ request, params }) => {
    await lat();
    const body = (await request.json()) as { status?: Room["status"] };
    const room = rooms.get(String(params.id));
    if (!room) return badRequest("not_found", "room not found", 404);
    if (!body.status) return badRequest("bad_request", "status is required");
    const updated = { ...room, status: body.status, updated_at: now() };
    rooms.set(room.id, updated);
    return HttpResponse.json(updated);
  }),
  http.get(`${V1}/hospitality/rooms/:id/charges`, async ({ params }) => {
    await lat();
    return HttpResponse.json({ items: roomCharges.get(String(params.id)) ?? [] });
  }),
  http.post(`${V1}/hospitality/rooms/:id/charge`, async ({ request, params }) => {
    await lat();
    const roomId = String(params.id);
    if (!rooms.has(roomId)) return badRequest("not_found", "room not found", 404);
    const body = (await request.json()) as { description?: string; amountCents?: number; orderId?: string };
    if (!body.description || !body.amountCents) return badRequest("bad_request", "description and amountCents are required");
    const charge: RoomCharge = {
      id: `rchg_${Math.random().toString(36).slice(2, 9)}`,
      tenant_id: "tnt_demo",
      room_id: roomId,
      order_id: body.orderId ?? null,
      description: body.description,
      amount_cents: body.amountCents,
      posted_at: now(),
      settled_at: null,
      created_at: now(),
    };
    roomCharges.set(roomId, [...(roomCharges.get(roomId) ?? []), charge]);
    return HttpResponse.json(charge, { status: 201 });
  }),
  http.post(`${V1}/hospitality/rooms/:id/settle`, async ({ params }) => {
    await lat();
    const roomId = String(params.id);
    const chargesForRoom = roomCharges.get(roomId) ?? [];
    let settled = 0;
    const updated = chargesForRoom.map((charge) => {
      if (charge.settled_at) return charge;
      settled += 1;
      return { ...charge, settled_at: now() };
    });
    roomCharges.set(roomId, updated);
    return HttpResponse.json({ settled });
  }),

  http.get(`${V1}/manufacturing/orders`, async ({ request }) => {
    await lat();
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    const items = [...productionOrders.values()].sort((a, b) => b.created_at - a.created_at);
    return HttpResponse.json({ items: status ? items.filter((order) => order.status === status) : items });
  }),
  http.get(`${V1}/manufacturing/orders/:id`, async ({ params }) => {
    await lat();
    const order = productionOrders.get(String(params.id));
    if (!order) return badRequest("not_found", "production order not found", 404);
    return HttpResponse.json({ ...order, bom: bomLines.get(order.id) ?? [] });
  }),
  http.post(`${V1}/manufacturing/orders`, async ({ request }) => {
    await lat();
    const body = (await request.json()) as { productId?: string; quantity?: number; notes?: string; bom?: Array<{ rawMaterialId?: string; qtyRequired?: number; unit?: string }> };
    if (!body.productId || !body.quantity || !Array.isArray(body.bom) || body.bom.length === 0) {
      return badRequest("bad_request", "productId, quantity and bom are required");
    }
    const id = `prodord_${Math.random().toString(36).slice(2, 9)}`;
    const order: ProductionOrder = {
      id,
      tenant_id: "tnt_demo",
      product_id: body.productId,
      quantity: body.quantity,
      status: "draft",
      started_at: null,
      completed_at: null,
      notes: body.notes ?? null,
      created_at: now(),
      updated_at: now(),
    };
    const lines: BomLine[] = body.bom.map((line) => ({
      id: `bom_${Math.random().toString(36).slice(2, 9)}`,
      tenant_id: "tnt_demo",
      production_order_id: id,
      raw_material_id: line.rawMaterialId ?? "raw_unknown",
      qty_required: line.qtyRequired ?? 0,
      qty_consumed: 0,
      unit: line.unit ?? "unit",
    }));
    productionOrders.set(id, order);
    bomLines.set(id, lines);
    return HttpResponse.json({ ...order, bom: lines }, { status: 201 });
  }),
  http.patch(`${V1}/manufacturing/orders/:id/status`, async ({ request, params }) => {
    await lat();
    const body = (await request.json()) as { status?: ProductionOrder["status"] };
    const order = productionOrders.get(String(params.id));
    if (!order) return badRequest("not_found", "production order not found", 404);
    if (!body.status) return badRequest("bad_request", "status is required");
    const nowTs = now();
    const updated: ProductionOrder = {
      ...order,
      status: body.status,
      started_at: body.status === "in_progress" ? nowTs : order.started_at,
      completed_at: body.status === "completed" ? nowTs : order.completed_at,
      updated_at: nowTs,
    };
    productionOrders.set(order.id, updated);
    return HttpResponse.json(updated);
  }),
  http.patch(`${V1}/manufacturing/bom-lines/:id/consume`, async ({ request, params }) => {
    await lat();
    const body = (await request.json()) as { qtyConsumed?: number };
    if (typeof body.qtyConsumed !== "number") return badRequest("bad_request", "qtyConsumed is required");
    for (const [orderId, lines] of bomLines.entries()) {
      const index = lines.findIndex((line) => line.id === String(params.id));
      if (index !== -1) {
        const next = [...lines];
        next[index] = { ...next[index]!, qty_consumed: body.qtyConsumed };
        bomLines.set(orderId, next);
        return HttpResponse.json(next[index]);
      }
    }
    return badRequest("not_found", "bom line not found", 404);
  }),

  http.get(`${V1}/rental/assets`, async ({ request }) => {
    await lat();
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    const items = [...rentalAssets.values()].sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json({ items: status ? items.filter((asset) => asset.status === status) : items });
  }),
  http.post(`${V1}/rental/assets`, async ({ request }) => {
    await lat();
    const body = (await request.json()) as { name?: string; sku?: string; category?: string; dailyRateCents?: number; depositCents?: number; serialNumber?: string; notes?: string };
    if (!body.name) return badRequest("bad_request", "name is required");
    const id = `rasset_${Math.random().toString(36).slice(2, 9)}`;
    const asset: RentalAsset = {
      id,
      tenant_id: "tnt_demo",
      name: body.name,
      sku: body.sku ?? null,
      category: body.category ?? null,
      daily_rate_cents: body.dailyRateCents ?? 0,
      deposit_cents: body.depositCents ?? 0,
      status: "available",
      serial_number: body.serialNumber ?? null,
      notes: body.notes ?? null,
      created_at: now(),
      updated_at: now(),
    };
    rentalAssets.set(id, asset);
    return HttpResponse.json(asset, { status: 201 });
  }),
  http.get(`${V1}/rental/contracts`, async ({ request }) => {
    await lat();
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    const items = rentalContracts.map((contract) => ({
      ...contract,
      asset_name: rentalAssets.get(contract.asset_id)?.name ?? "Unknown asset",
      daily_rate_cents: rentalAssets.get(contract.asset_id)?.daily_rate_cents ?? 0,
    }));
    return HttpResponse.json({ items: status ? items.filter((contract) => contract.status === status) : items });
  }),
  http.post(`${V1}/rental/contracts`, async ({ request }) => {
    await lat();
    const body = (await request.json()) as { assetId?: string; customerId?: string; startsAt?: number; endsAt?: number; notes?: string };
    if (!body.assetId || !body.startsAt || !body.endsAt) return badRequest("bad_request", "assetId, startsAt and endsAt are required");
    const asset = rentalAssets.get(body.assetId);
    if (!asset) return badRequest("not_found", "asset not found", 404);
    if (asset.status !== "available") return badRequest("asset_unavailable", "asset is not available", 409);
    const id = `rcon_${Math.random().toString(36).slice(2, 9)}`;
    const days = Math.max(1, Math.ceil((body.endsAt - body.startsAt) / day));
    const contract: RentalContract = {
      id,
      tenant_id: "tnt_demo",
      asset_id: body.assetId,
      customer_id: body.customerId ?? null,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      deposit_cents: asset.deposit_cents,
      total_cents: days * asset.daily_rate_cents,
      status: "active",
      returned_at: null,
      notes: body.notes ?? null,
      created_at: now(),
      updated_at: now(),
    };
    rentalContracts = [contract, ...rentalContracts];
    rentalAssets.set(asset.id, { ...asset, status: "rented", updated_at: now() });
    return HttpResponse.json(contract, { status: 201 });
  }),
  http.post(`${V1}/rental/contracts/:id/return`, async ({ params }) => {
    await lat();
    const contract = rentalContracts.find((row) => row.id === String(params.id));
    if (!contract) return badRequest("not_found", "contract not found", 404);
    if (contract.status !== "active") return badRequest("contract_not_active", "contract is not active", 409);
    const updated = { ...contract, status: "returned" as const, returned_at: now(), updated_at: now() };
    rentalContracts = rentalContracts.map((row) => (row.id === updated.id ? updated : row));
    const asset = rentalAssets.get(updated.asset_id);
    if (asset) rentalAssets.set(asset.id, { ...asset, status: "available", updated_at: now() });
    return HttpResponse.json(updated);
  }),

  http.get(`${V1}/entertainment/events`, async ({ request }) => {
    await lat();
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    return HttpResponse.json({ items: eventList(status) });
  }),
  http.post(`${V1}/entertainment/events`, async ({ request }) => {
    await lat();
    const body = (await request.json()) as { name?: string; venue?: string; startsAt?: number; endsAt?: number; capacity?: number; priceCents?: number; description?: string };
    if (!body.name || !body.startsAt || !body.endsAt) return badRequest("bad_request", "name, startsAt and endsAt are required");
    const id = `evt_${Math.random().toString(36).slice(2, 9)}`;
    const row: EventRow = {
      id,
      tenant_id: "tnt_demo",
      name: body.name,
      venue: body.venue ?? null,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      capacity: body.capacity ?? 100,
      sold: 0,
      price_cents: body.priceCents ?? 0,
      status: "on_sale",
      description: body.description ?? null,
      created_at: now(),
      updated_at: now(),
    };
    events.set(id, row);
    tickets.set(id, []);
    return HttpResponse.json(row, { status: 201 });
  }),
  http.get(`${V1}/entertainment/events/:id/tickets`, async ({ params }) => {
    await lat();
    return HttpResponse.json({ items: tickets.get(String(params.id)) ?? [] });
  }),
  http.post(`${V1}/entertainment/events/:id/sell`, async ({ request, params }) => {
    await lat();
    const body = (await request.json()) as { customerId?: string; quantity?: number };
    const quantity = body.quantity ?? 1;
    const event = events.get(String(params.id));
    if (!event) return badRequest("not_found", "event not found", 404);
    if (event.status !== "on_sale") return badRequest("event_not_on_sale", "event is not on sale", 409);
    if (event.sold + quantity > event.capacity) return badRequest("insufficient_capacity", "not enough capacity", 409);
    const createdTickets: TicketRow[] = [];
    for (let i = 0; i < quantity; i += 1) {
      createdTickets.push({
        id: `tkt_${Math.random().toString(36).slice(2, 9)}`,
        tenant_id: "tnt_demo",
        event_id: event.id,
        customer_id: body.customerId ?? null,
        qr_code: `${event.id}_${Math.random().toString(36).slice(2, 8)}`,
        redeemed_at: null,
        created_at: now(),
      });
    }
    tickets.set(event.id, [...(tickets.get(event.id) ?? []), ...createdTickets]);
    events.set(event.id, { ...event, sold: event.sold + quantity, updated_at: now() });
    return HttpResponse.json({ tickets: createdTickets.map((ticket) => ({ id: ticket.id, qr_code: ticket.qr_code })) }, { status: 201 });
  }),
  http.post(`${V1}/entertainment/tickets/redeem`, async ({ request }) => {
    await lat();
    const body = (await request.json()) as { qrCode?: string };
    if (!body.qrCode) return badRequest("bad_request", "qrCode is required");
    for (const [eventId, eventTickets] of tickets.entries()) {
      const index = eventTickets.findIndex((ticket) => ticket.qr_code === body.qrCode);
      if (index !== -1) {
        const ticket = eventTickets[index]!;
        if (ticket.redeemed_at) return badRequest("already_redeemed", "ticket already redeemed", 409);
        const updated = { ...ticket, redeemed_at: now() };
        const next = [...eventTickets];
        next[index] = updated;
        tickets.set(eventId, next);
        return HttpResponse.json(updated);
      }
    }
    return badRequest("not_found", "ticket not found", 404);
  }),

  http.get(`${V1}/education/students`, async ({ request }) => {
    await lat();
    const url = new URL(request.url);
    return HttpResponse.json({
      items: studentList(url.searchParams.get("q") ?? undefined, url.searchParams.get("course") ?? undefined, url.searchParams.get("status") ?? undefined),
    });
  }),
  http.get(`${V1}/education/students/:id`, async ({ params }) => {
    await lat();
    const student = students.get(String(params.id));
    if (!student) return badRequest("not_found", "student not found", 404);
    return HttpResponse.json(studentWithFees(student));
  }),
  http.post(`${V1}/education/students`, async ({ request }) => {
    await lat();
    const body = (await request.json()) as { name?: string; email?: string; phone?: string; course?: string; notes?: string };
    if (!body.name) return badRequest("bad_request", "name is required");
    const id = `stu_${Math.random().toString(36).slice(2, 9)}`;
    const row: StudentRow = {
      id,
      tenant_id: "tnt_demo",
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      course: body.course ?? null,
      enrolled_at: now(),
      status: "active",
      notes: body.notes ?? null,
      created_at: now(),
      updated_at: now(),
    };
    students.set(id, row);
    fees.set(id, []);
    return HttpResponse.json(row, { status: 201 });
  }),
  http.patch(`${V1}/education/students/:id`, async ({ request, params }) => {
    await lat();
    const student = students.get(String(params.id));
    if (!student) return badRequest("not_found", "student not found", 404);
    const body = (await request.json()) as Partial<Pick<StudentRow, "status" | "course" | "notes">>;
    const updated: StudentRow = {
      ...student,
      status: body.status ?? student.status,
      course: body.course ?? student.course,
      notes: body.notes ?? student.notes,
      updated_at: now(),
    };
    students.set(updated.id, updated);
    return HttpResponse.json(updated);
  }),
  http.post(`${V1}/education/students/:id/fees`, async ({ request, params }) => {
    await lat();
    const student = students.get(String(params.id));
    if (!student) return badRequest("not_found", "student not found", 404);
    const body = (await request.json()) as { description?: string; amountCents?: number; dueDate?: number };
    if (!body.description || !body.amountCents) return badRequest("bad_request", "description and amountCents are required");
    const fee: FeeRow = {
      id: `fee_${Math.random().toString(36).slice(2, 9)}`,
      tenant_id: "tnt_demo",
      student_id: student.id,
      description: body.description,
      amount_cents: body.amountCents,
      due_date: body.dueDate ?? null,
      paid_at: null,
      method: null,
      order_id: null,
      created_at: now(),
    };
    fees.set(student.id, [...(fees.get(student.id) ?? []), fee]);
    return HttpResponse.json(fee, { status: 201 });
  }),
  http.post(`${V1}/education/fees/:id/collect`, async ({ request, params }) => {
    await lat();
    const body = (await request.json()) as { method?: string };
    for (const [studentId, studentFees] of fees.entries()) {
      const index = studentFees.findIndex((fee) => fee.id === String(params.id));
      if (index !== -1) {
        const fee = studentFees[index]!;
        if (fee.paid_at) return badRequest("already_paid", "fee already paid", 409);
        const updated: FeeRow = { ...fee, paid_at: now(), method: body.method ?? "cash" };
        const next = [...studentFees];
        next[index] = updated;
        fees.set(studentId, next);
        return HttpResponse.json(updated);
      }
    }
    return badRequest("not_found", "fee not found", 404);
  }),
];

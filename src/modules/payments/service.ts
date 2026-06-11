import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import { Money, type Cents } from "../../shared/money.js";
import { notFound, badRequest, conflict } from "../../shared/http.js";

export type PaymentMethod = "cash" | "card" | "split";
export type PaymentStatus = "captured" | "declined";

export interface PaymentRecord {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount_cents: Cents;
  cash_cents: Cents;
  card_cents: Cents;
  change_cents: Cents;
  card_last4: string | null;
  auth_code: string | null;
  status: PaymentStatus;
  created_at: number;
}

export interface CapturePaymentInput {
  orderId: string;
  method: PaymentMethod;
  cashCents?: Cents;
  cardCents?: Cents;
  tenderedCents?: Cents;
}

interface OrderRow {
  total_cents: number;
  status: string;
}

const CLOSED_ORDER_STATUSES = new Set(["completed", "refunded", "voided", "paid"]);

function simulateCardRead(): { last4: string; authCode: string } {
  const last4 = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const token = uuidv7().replace(/-/g, "").slice(0, 12).toUpperCase();
  return { last4, authCode: `EMV-${token}` };
}

export class PaymentsService {
  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {}

  /** Resolve the amount owed from the orders table, enforcing existence/status. */
  private async loadOrderOwed(orderId: string): Promise<Cents> {
    const order = await this.db.one<OrderRow>(
      "SELECT total_cents, status FROM orders WHERE id = ?",
      [orderId],
    );
    if (!order) {
      throw notFound(`order ${orderId} not found`);
    }
    if (CLOSED_ORDER_STATUSES.has(order.status)) {
      throw conflict(`order ${orderId} is ${order.status} and cannot be paid`);
    }
    return order.total_cents;
  }

  async capture(input: CapturePaymentInput): Promise<PaymentRecord> {
    const owed = await this.loadOrderOwed(input.orderId);

    let cashCents = 0;
    let cardCents = 0;
    let changeCents = 0;
    let cardLast4: string | null = null;
    let authCode: string | null = null;
    const status: PaymentStatus = "captured";

    switch (input.method) {
      case "cash": {
        const tendered = input.tenderedCents ?? 0;
        if (tendered < owed) {
          throw badRequest(`insufficient cash: tendered ${tendered} < owed ${owed}`);
        }
        cashCents = tendered;
        changeCents = Money.sub(tendered, owed);
        break;
      }

      case "card": {
        if (owed <= 0) {
          throw badRequest(`cannot charge card for non-positive amount ${owed}`);
        }
        const { last4, authCode: code } = simulateCardRead();
        cardCents = owed;
        cardLast4 = last4;
        authCode = code;
        break;
      }

      case "split": {
        const cash = input.cashCents ?? 0;
        const card = input.cardCents ?? 0;
        if (cash < 0 || card < 0) {
          throw badRequest("split amounts must be non-negative");
        }
        const total = Money.add(cash, card);
        if (total < owed) {
          throw badRequest(`split tender ${total} is less than owed ${owed}`);
        }
        if (card > owed) {
          throw badRequest(
            `card tender ${card} exceeds owed ${owed}; change is returned as cash only`,
          );
        }
        changeCents = Money.sub(total, owed);
        cashCents = cash;
        cardCents = card;
        if (card > 0) {
          const { last4, authCode: code } = simulateCardRead();
          cardLast4 = last4;
          authCode = code;
        }
        break;
      }

      default: {
        const exhaustive: never = input.method;
        throw badRequest(`unsupported payment method ${String(exhaustive)}`);
      }
    }

    const record: PaymentRecord = {
      id: `pay_${uuidv7()}`,
      order_id: input.orderId,
      method: input.method,
      amount_cents: owed,
      cash_cents: cashCents,
      card_cents: cardCents,
      change_cents: changeCents,
      card_last4: cardLast4,
      auth_code: authCode,
      status,
      created_at: Date.now(),
    };

    await this.db.query(
      `INSERT INTO payments
         (id, order_id, method, amount_cents, cash_cents, card_cents,
          change_cents, card_last4, auth_code, status, created_at)
       VALUES
         (@id, @order_id, @method, @amount_cents, @cash_cents, @card_cents,
          @change_cents, @card_last4, @auth_code, @status, @created_at)`,
      record as unknown as Record<string, unknown>,
    );

    await this.events.publish(
      "payment.captured",
      {
        id: record.id,
        orderId: record.order_id,
        method: record.method,
        amountCents: record.amount_cents,
        changeCents: record.change_cents,
      },
      record.id,
    );

    return record;
  }

  async get(id: string): Promise<PaymentRecord> {
    const row = await this.db.one<PaymentRecord>("SELECT * FROM payments WHERE id = ?", [id]);
    if (!row) {
      throw notFound(`payment ${id} not found`);
    }
    return row;
  }

  async listByOrder(orderId: string): Promise<PaymentRecord[]> {
    return this.db.query<PaymentRecord>(
      "SELECT * FROM payments WHERE order_id = ? ORDER BY created_at ASC",
      [orderId],
    );
  }
}

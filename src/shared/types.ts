import type { Cents } from "./money.js";

/** US state codes supported by the tax engine in Year 1. */
export type StateCode = "CA" | "NY" | "TX" | "FL";

/** Immutable domain event. Every state change in the platform emits one. */
export interface DomainEvent<T = unknown> {
  /** e.g. "order.created", "payment.captured", "inventory.adjusted" */
  type: string;
  /** ISO timestamp */
  occurredAt: string;
  /** event-specific payload */
  payload: T;
  /** optional aggregate id the event concerns */
  aggregateId?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type { Cents };

"use client";

import { formatMoney } from "@/lib/money";

interface ReceiptLineItem {
  name: string;
  quantity: number;
  price_cents: number;
  total_cents: number;
}

interface ThermalReceiptProps {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  receiptNumber: string;
  dateTime: string;
  lineItems: ReceiptLineItem[];
  subtotal_cents: number;
  tax_cents: number;
  discount_cents?: number;
  total_cents: number;
  paymentMethod: string;
  amountTendered_cents?: number;
  change_cents?: number;
  footerMessage?: string;
}

export function ThermalReceipt({
  storeName, storeAddress, storePhone, receiptNumber, dateTime,
  lineItems, subtotal_cents, tax_cents, discount_cents = 0,
  total_cents, paymentMethod, amountTendered_cents, change_cents,
  footerMessage = "Thank you for your business!",
}: ThermalReceiptProps) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #thermal-receipt, #thermal-receipt * { visibility: visible !important; }
          #thermal-receipt {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            font-family: 'Courier New', monospace !important;
            font-size: 10pt !important;
            line-height: 1.4 !important;
            color: #000 !important;
            background: #fff !important;
          }
        }
      `}</style>

      <div id="thermal-receipt" className="font-mono text-xs text-black" style={{ width: "76mm", fontFamily: "'Courier New', monospace" }}>
        {/* Header */}
        <div className="text-center font-bold text-sm mb-1">{storeName}</div>
        {storeAddress && <div className="text-center text-xs">{storeAddress}</div>}
        {storePhone && <div className="text-center text-xs">{storePhone}</div>}
        <div className="border-t border-dashed border-black my-1" />

        {/* Receipt info */}
        <div className="flex justify-between text-xs">
          <span>#{receiptNumber}</span>
          <span>{dateTime}</span>
        </div>
        <div className="border-t border-dashed border-black my-1" />

        {/* Line items */}
        <div className="space-y-0.5">
          {lineItems.map((item, i) => (
            <div key={i}>
              <div className="text-xs truncate">{item.name}</div>
              <div className="flex justify-between text-xs pl-2">
                <span>{item.quantity} × {formatMoney(item.price_cents)}</span>
                <span>{formatMoney(item.total_cents)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-black my-1" />

        {/* Totals */}
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal_cents)}</span>
          </div>
          {discount_cents > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{formatMoney(discount_cents)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{formatMoney(tax_cents)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm border-t border-black mt-1 pt-1">
            <span>TOTAL</span>
            <span>{formatMoney(total_cents)}</span>
          </div>
        </div>
        <div className="border-t border-dashed border-black my-1" />

        {/* Payment */}
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between">
            <span>{paymentMethod}</span>
            <span>{amountTendered_cents != null ? formatMoney(amountTendered_cents) : formatMoney(total_cents)}</span>
          </div>
          {change_cents != null && change_cents > 0 && (
            <div className="flex justify-between font-bold">
              <span>Change</span>
              <span>{formatMoney(change_cents)}</span>
            </div>
          )}
        </div>
        <div className="border-t border-dashed border-black my-1" />

        {/* Footer */}
        <div className="text-center text-xs mt-1">{footerMessage}</div>
      </div>
    </>
  );
}

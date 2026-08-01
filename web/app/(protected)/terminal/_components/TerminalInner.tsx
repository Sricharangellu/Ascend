"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useOffline } from "@/lib/useOffline";
import { useCart } from "@/lib/useCart";
import { useToast } from "@/components/Toast";
import { enqueue } from "@/lib/syncOutbox";
import { apiGet, apiPost, apiPut, ApiResponseError } from "@/api-client/client";
import type { Order, Payment, TerminalProduct as Product } from "@/api-client/types";
import { useBarcodeScanner } from "@/lib/useBarcodeScanner";
import { normalizeTerminalProduct, normalizeTerminalOrder } from "@/lib/normalizeTerminalProduct";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { ProductGrid } from "@/components/terminal/ProductGrid";
import { CartPanel } from "@/components/terminal/CartPanel";
import { TenderScreen } from "@/components/terminal/TenderScreen";
import { ReceiptView } from "@/components/terminal/ReceiptView";
import { DiscountModal } from "@/components/terminal/DiscountModal";
import { OfflineQueueBanner } from "@/components/terminal/OfflineQueueBanner";
import { RegisterSessionGuard } from "@/components/terminal/RegisterSessionGuard";
import { ShortcutsOverlay } from "@/components/terminal/ShortcutsOverlay";
import { useFlag } from "@/flags/useFlag";
import { ScanToast } from "@/components/ScanToast";
import { useFinderContext } from "@/lib/useFinderContext";
import { CheckoutStatusStrip } from "./CheckoutStatusStrip";
import { TerminalActionBar } from "./TerminalActionBar";

export function TerminalInner() {
  const { user } = useAuth();
  const { registerId } = useFinderContext();
  const { isOffline } = useOffline();
  const cart = useCart();
  const { addToast } = useToast();
  const splitTenderEnabled = useFlag("checkout_split_tender");

  const [screen, setScreen] = useState<"terminal" | "tender" | "receipt">("terminal");
  const [completedPayment, setCompletedPayment] = useState<Payment | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [ageVerified, setAgeVerified] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [discountCents, setDiscountCents] = useState(0);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [scannedName, setScannedName] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [activeOutletId, setActiveOutletId] = useState<string>("");
  const [outlets, setOutlets] = useState<{ id: string; name: string; state?: string }[]>([]);
  const [outletState, setOutletState] = useState<string>("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "?" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setShortcutsOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    apiGet<{ items: { id: string; name: string; state?: string }[] }>("/api/v1/inventory/locations")
      .then((d) => {
        const locs = d.items ?? [];
        setOutlets(locs);
        const initial = locs[0];
        if (initial) {
          setActiveOutletId(initial.id);
          if (initial.state) setOutletState(initial.state);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loc = outlets.find((o) => o.id === activeOutletId);
    if (loc?.state) setOutletState(loc.state);
  }, [activeOutletId, outlets]);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (cart.state.lines.length === 0) {
      orderIdRef.current = null;
      cart.dispatch({ type: "SET_SYNCING", value: false });
      return;
    }
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    cart.dispatch({ type: "SET_SYNCING", value: true });
    // No existing order yet: debounce longer since a burst of line-item scans
    // typically follows. Once an order exists, a shorter debounce keeps
    // discount/quantity edits feeling responsive.
    const delay = orderIdRef.current ? 200 : 400;
    syncTimerRef.current = setTimeout(() => { void syncOrder(); }, delay);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.state.lines, discountCents]);

  const syncOrder = useCallback(async () => {
    const lines = cart.state.lines;
    if (lines.length === 0) return;

    const payload: Record<string, unknown> = {
      lines: lines.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
        ...(l.product.ageRestricted ? { ageVerified } : {}),
        ...(l.product.unitKind ? { unitKind: l.product.unitKind } : {}),
      })),
      ...(discountCents > 0 ? { discountCents } : {}),
    };

    if (isOffline) {
      enqueue("create_order", payload);
      cart.dispatch({ type: "SET_SYNCING", value: false });
      return;
    }

    try {
      let order: Order;
      if (orderIdRef.current) {
        order = normalizeTerminalOrder(await apiPut<Order>(`/api/v1/orders/${orderIdRef.current}`, payload));
      } else {
        order = normalizeTerminalOrder(await apiPost<Order>("/api/v1/orders", payload));
        orderIdRef.current = order.id;
      }
      cart.dispatch({ type: "SET_ORDER", order });
    } catch (err) {
      cart.dispatch({ type: "SET_SYNCING", value: false });
      if (err instanceof ApiResponseError && err.status !== 409) {
        addToast({ title: "Could not sync cart", description: err.message, variant: "error" });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.state.lines, isOffline, ageVerified, discountCents]);

  const handleAddProduct = useCallback(
    (product: Product) => {
      if (outletState && product.restrictedStates?.includes(outletState)) {
        addToast({
          title: "Product restricted",
          description: `${product.name} cannot be sold in ${outletState} (state product ban).`,
          variant: "error",
        });
        return;
      }
      cart.addProduct(product);
    },
    [cart, outletState, addToast]
  );

  const handleBarcodeScan = useCallback(async (code: string) => {
    if (screen !== "terminal") return;
    try {
      // POS-v1: fully resolved (product + packaging + price + stock) — the
      // terminal does no conversion/pricing math, it only renders this.
      const raw = await apiGet<Product>(`/api/v1/catalog/barcode/${encodeURIComponent(code)}/pos`);
      const product = normalizeTerminalProduct(raw); // real backend returns snake_case
      cart.addProduct(product);
      setScannedName(product.unitKind ? `${product.name} (${product.unitDisplayName})` : product.name);
    } catch {
      addToast({ title: `Barcode not found: ${code}`, variant: "error" });
    }
  }, [screen, cart, addToast]);

  useBarcodeScanner({ onScan: handleBarcodeScan });

  const handleCharge = useCallback(() => {
    if (!cart.state.order) return;
    setScreen("tender");
  }, [cart.state.order]);

  const handleReturnMode = useCallback(() => {
    setReturnMode((current) => {
      const next = !current;
      addToast({ title: next ? "Return mode enabled" : "Return mode disabled", variant: next ? "warning" : "info" });
      return next;
    });
  }, [addToast]);

  const handleTenderSuccess = useCallback(
    (payment: Payment) => {
      setCompletedPayment(payment);
      // A successful tender completes the order, but cart.state.order still
      // carries the "open" status it was created with. Stamp it "completed" so
      // the receipt renders correctly — otherwise ReceiptView's status fallback
      // mistitles the success screen "Order Voided" and hides refund/void.
      setCompletedOrder(
        cart.state.order ? { ...cart.state.order, status: "completed" } : null,
      );
      setScreen("receipt");
      const lines = cart.state.lines;
      if (lines.length > 0 && activeOutletId) {
        apiPost("/api/v1/inventory/deduct", {
          location_id: activeOutletId,
          lines: lines.map((l) => ({ product_id: l.product.id, qty: l.quantity })),
          order_id: cart.state.order?.id ?? null,
        }).catch(() => {});
      }
    },
    [cart.state.order, cart.state.lines, activeOutletId]
  );

  const handleTenderCancel = useCallback(() => { setScreen("terminal"); }, []);

  const handleNewSale = useCallback(() => {
    cart.clearCart();
    orderIdRef.current = null;
    setCompletedPayment(null);
    setCompletedOrder(null);
    setScreen("terminal");
    setAgeVerified(false);
    setReturnMode(false);
    setDiscountCents(0);
    addToast({ title: "New sale started", variant: "info" });
  }, [cart, addToast]);

  const handleClearCart = useCallback(() => {
    cart.clearCart();
    orderIdRef.current = null;
    setAgeVerified(false);
    setReturnMode(false);
    setDiscountCents(0);
  }, [cart]);

  const activeOutletName = outlets.find((o) => o.id === activeOutletId)?.name ?? activeOutletId;

  const hasAgeRestricted = cart.state.lines.some((line) => line.product.ageRestricted);
  const canCharge =
    cart.state.lines.length > 0 &&
    !cart.state.syncing &&
    cart.state.order !== null &&
    (!hasAgeRestricted || ageVerified);
  const totalCents = cart.state.order?.totalCents ?? cart.localSubtotalCents;

  return (
    <EnterpriseShell
      active="register"
      title="Sell"
      subtitle={`${activeOutletName} · ${registerId}`}
      banner={<OfflineQueueBanner />}
      contentClassName="flex flex-1 flex-col overflow-hidden lg:flex-row"
    >
      <RegisterSessionGuard registerId={registerId}>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <CheckoutStatusStrip
            cashier={user?.name ?? "Cashier"}
            isOffline={isOffline}
            returnMode={returnMode}
            itemCount={cart.itemCount}
            onShortcuts={() => setShortcutsOpen(true)}
            activeOutletId={activeOutletId}
            outlets={outlets}
            onOutletChange={setActiveOutletId}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <ProductGrid onAddProduct={handleAddProduct} />
            </div>
            <div className="h-[42vh] shrink-0 overflow-hidden border-t border-slate-200 lg:h-auto lg:w-[45%] lg:border-l lg:border-t-0">
              <CartPanel
                cart={cart}
                onCharge={handleCharge}
                onClear={handleClearCart}
                role={user?.role}
                ageVerified={ageVerified}
                onAgeVerifiedChange={setAgeVerified}
              />
            </div>
          </div>
          <TerminalActionBar
            canCharge={canCharge}
            totalCents={totalCents}
            returnMode={returnMode}
            hasCart={cart.state.lines.length > 0}
            discountActive={discountCents > 0}
            onDiscount={() => setShowDiscountModal(true)}
            onReturnMode={handleReturnMode}
            onCharge={handleCharge}
          />
        </div>
      </RegisterSessionGuard>

      {screen === "tender" && cart.state.order && (
        <TenderScreen
          order={cart.state.order}
          onSuccess={handleTenderSuccess}
          onCancel={handleTenderCancel}
          splitEnabled={splitTenderEnabled}
        />
      )}

      {screen === "receipt" && completedOrder && completedPayment && (
        <ReceiptView
          order={completedOrder}
          payment={completedPayment}
          onNewSale={handleNewSale}
          role={user?.role ?? "cashier"}
        />
      )}

      {showDiscountModal && (
        <DiscountModal
          orderTotalCents={cart.state.order?.totalCents ?? cart.localSubtotalCents}
          currentDiscountCents={discountCents}
          onApply={(cents) => { setDiscountCents(cents); setShowDiscountModal(false); }}
          onRemove={() => { setDiscountCents(0); setShowDiscountModal(false); }}
          onClose={() => setShowDiscountModal(false)}
        />
      )}

      <ScanToast productName={scannedName} onDismiss={() => setScannedName(null)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </EnterpriseShell>
  );
}

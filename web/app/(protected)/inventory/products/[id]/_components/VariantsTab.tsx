"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct, CatalogProductsResponse } from "@/api-client/types";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none";

export function VariantsTab({ product }: { product: CatalogProduct }) {
  const [variants, setVariants] = useState<CatalogProduct[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [assignInput, setAssignInput] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignDone, setAssignDone] = useState(false);

  const isMaster = !product.parent_product_id;
  const createVariantHref = `/inventory/products/new?parent=${encodeURIComponent(product.id)}`;

  useEffect(() => {
    if (!isMaster) return;
    const controller = new AbortController();
    setVariantsLoading(true);
    apiGet<CatalogProductsResponse>(`/api/v1/catalog/${product.id}/variants`, { signal: controller.signal })
      .then((data) => { setVariants(data.items); setVariantsError(null); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setVariantsError(err instanceof ApiResponseError ? err.message : "Could not load variants.");
      })
      .finally(() => { if (!controller.signal.aborted) setVariantsLoading(false); });
    return () => controller.abort();
  }, [product.id, isMaster]);

  async function handleAssign() {
    const productIds = assignInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (productIds.length === 0) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await apiPost(`/api/v1/catalog/${product.id}/variants/assign`, { productIds });
      const data = await apiGet<CatalogProductsResponse>(`/api/v1/catalog/${product.id}/variants`);
      setVariants(data.items);
      setAssignInput("");
      setAssignDone(true);
    } catch (err) {
      setAssignError(err instanceof ApiResponseError ? err.message : "Assign failed.");
    } finally { setAssigning(false); }
  }

  if (!isMaster) {
    return (
      <div className="flex flex-col gap-5">
        <Card title="Variant info">
          <p className="text-sm text-slate-700">
            This product is a variant. Parent product ID:{" "}
            <Link
              href={`/inventory/products/${product.parent_product_id}`}
              className="font-mono text-slate-950 underline underline-offset-2"
            >
              {product.parent_product_id}
            </Link>
          </p>
          {product.variant_label && (
            <p className="mt-2 text-sm text-slate-600">
              Variant label: <span className="font-medium">{product.variant_label}</span>
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Link
          href={createVariantHref}
          className="inline-flex min-h-9 items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-50"
        >
          Create child variant
        </Link>
      </div>

      <Card title="Child variants">
        {variantsLoading ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : variantsError ? (
          <div className="text-sm text-danger-700" role="alert">{variantsError}</div>
        ) : variants.length === 0 ? (
          <p className="text-sm text-slate-500">No child variants assigned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Variant label</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {variants.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/inventory/products/${v.id}`}
                        className="font-mono text-xs font-semibold text-slate-950 underline-offset-2 hover:underline">
                        {v.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-950">{v.name}</td>
                    <td className="px-4 py-3 text-slate-600">{v.variant_label ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold capitalize ${
                        v.status === "active" ? "bg-success-100 text-success-700"
                        : v.status === "archived" ? "bg-danger-100 text-danger-700"
                        : "bg-slate-100 text-slate-600"
                      }`}>
                        {v.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Assign children by product ID">
        <p className="mb-3 text-sm text-slate-600">
          Enter product IDs (one per line or comma-separated) to assign them as children of this master product.
        </p>
        <textarea
          value={assignInput}
          onChange={(e) => { setAssignInput(e.target.value); setAssignDone(false); }}
          rows={4}
          placeholder={"product-id-1\nproduct-id-2"}
          className={INPUT_CLASS}
        />
        {assignError && <div className="mt-2 text-sm text-danger-700" role="alert">{assignError}</div>}
        {assignDone && <div className="mt-2 text-sm text-success-700" role="status">Variants assigned successfully.</div>}
        <div className="mt-3 flex justify-end">
          <Button variant="primary" size="sm" onClick={() => void handleAssign()} loading={assigning} disabled={!assignInput.trim()}>
            Assign variants
          </Button>
        </div>
      </Card>
    </div>
  );
}

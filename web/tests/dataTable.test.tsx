/**
 * @vitest-environment jsdom
 *
 * DataTable — behaviour guards for the primitive that replaces 107 hand-rolled
 * tables. The point of consolidating them is that these behaviours become
 * guaranteed rather than per-author, so they are asserted here once.
 *
 * The accessibility assertions are the load-bearing ones. A hand-rolled table
 * can look correct and still be unusable by keyboard or screen reader; nothing
 * in a type check or a visual pass catches a missing `aria-sort` or an
 * unlabelled selection checkbox, so only a test does.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type DataColumn } from "@/components/DataTable";

interface Row {
  id: string;
  sku: string;
  name: string;
  qty: number;
}

const ROWS: Row[] = [
  { id: "1", sku: "APL-002", name: "Banana", qty: 12 },
  { id: "2", sku: "APL-001", name: "Apple", qty: 3 },
  { id: "3", sku: "APL-003", name: "Cherry", qty: 120 },
];

const COLUMNS: DataColumn<Row>[] = [
  { key: "sku", header: "SKU", render: (r) => r.sku, sortValue: (r) => r.sku },
  { key: "name", header: "Name", render: (r) => r.name, sortValue: (r) => r.name },
  { key: "qty", header: "Qty", render: (r) => r.qty, sortValue: (r) => r.qty, numeric: true },
];

function setup(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable
      caption="Products"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(r) => r.id}
      {...props}
    />
  );
}

/** Data rows only — excludes the header row. */
function bodyRows() {
  const table = screen.getByRole("table");
  const body = table.querySelector("tbody")!;
  return within(body).getAllByRole("row");
}

describe("DataTable", () => {
  it("renders an accessible table named by its caption", () => {
    setup();
    expect(screen.getByRole("table", { name: "Products" })).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(3);
  });

  it("sorts by a column and reflects direction in aria-sort", async () => {
    const user = userEvent.setup();
    setup();

    const skuHeader = screen.getByRole("columnheader", { name: /SKU/ });
    expect(skuHeader).toHaveAttribute("aria-sort", "none");

    await user.click(within(skuHeader).getByRole("button"));
    expect(skuHeader).toHaveAttribute("aria-sort", "ascending");
    expect(within(bodyRows()[0]).getByText("APL-001")).toBeInTheDocument();

    await user.click(within(skuHeader).getByRole("button"));
    expect(skuHeader).toHaveAttribute("aria-sort", "descending");
    expect(within(bodyRows()[0]).getByText("APL-003")).toBeInTheDocument();
  });

  it("sorts numeric columns numerically, not lexically", async () => {
    const user = userEvent.setup();
    setup();

    // Lexical sort would put 12 and 120 before 3. Numeric must not.
    await user.click(within(screen.getByRole("columnheader", { name: /Qty/ })).getByRole("button"));
    const values = bodyRows().map((r) => within(r).getAllByRole("cell")[2].textContent);
    expect(values).toEqual(["3", "12", "120"]);
  });

  it("filters via search and offers a recovery action when nothing matches", async () => {
    const user = userEvent.setup();
    setup({ searchable: true });

    await user.type(screen.getByRole("searchbox"), "Banana");
    expect(bodyRows()).toHaveLength(1);

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "zzzz");
    expect(screen.getByText("No matches")).toBeInTheDocument();

    // The empty state must offer a way out, not just report the dead end.
    await user.click(screen.getByRole("button", { name: /clear search/i }));
    expect(bodyRows()).toHaveLength(3);
  });

  it("does not mutate the caller's rows array when sorting", async () => {
    const user = userEvent.setup();
    const original = [...ROWS];
    setup();
    await user.click(within(screen.getByRole("columnheader", { name: /Name/ })).getByRole("button"));
    expect(ROWS).toEqual(original);
  });

  it("selects rows through labelled checkboxes and exposes them to bulk actions", async () => {
    const user = userEvent.setup();
    const onBulk = vi.fn();
    setup({
      selectable: true,
      bulkActions: (selected) => (
        <button type="button" onClick={() => onBulk(selected)}>
          Archive
        </button>
      ),
    });

    // Every selection control must have an accessible name.
    const rowBoxes = screen.getAllByRole("checkbox", { name: /select row/i });
    expect(rowBoxes).toHaveLength(3);

    await user.click(rowBoxes[0]);
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(onBulk).toHaveBeenCalledWith([ROWS[0]]);
  });

  it("select-all applies to the current page and is reversible", async () => {
    const user = userEvent.setup();
    setup({ selectable: true, bulkActions: () => null });

    const selectAll = screen.getByRole("checkbox", { name: /select all rows/i });
    await user.click(selectAll);
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    await user.click(selectAll);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("paginates and reports the visible slice", async () => {
    const user = userEvent.setup();
    setup({ pageSize: 2 });

    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it("renders an error state with a retry instead of an empty grid", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    setup({ error: "Network unreachable", onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("Network unreachable");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the empty state with its call to action when there are no rows", () => {
    setup({
      rows: [],
      emptyTitle: "No products yet",
      emptyDescription: "Import a catalogue to get started.",
      emptyAction: <button type="button">Import products</button>,
    });

    expect(screen.getByText("No products yet")).toBeInTheDocument();
    // An empty state without a next action is the first-run defect the audit flagged.
    expect(screen.getByRole("button", { name: "Import products" })).toBeInTheDocument();
  });

  it("hides and restores columns through the column menu", async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.getByRole("columnheader", { name: /Qty/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /columns/i }));
    await user.click(screen.getByRole("checkbox", { name: "Qty" }));

    expect(screen.queryByRole("columnheader", { name: /Qty/ })).not.toBeInTheDocument();
  });

  it("renders skeleton rows while loading rather than an empty state", () => {
    setup({ loading: true, rows: [] });
    expect(screen.queryByText(/nothing here yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

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

  describe("expandable rows", () => {
    it("toggles a detail panel and wires aria-expanded/aria-controls", async () => {
      const user = userEvent.setup();
      setup({ expandedContent: (r) => <div>Detail for {r.name}</div> });

      const toggle = screen.getAllByRole("button", { name: /expand details/i })[0];
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Detail for Banana")).not.toBeInTheDocument();

      await user.click(toggle);
      expect(screen.getByText("Detail for Banana")).toBeInTheDocument();

      const open = screen.getByRole("button", { name: /collapse details/i });
      expect(open).toHaveAttribute("aria-expanded", "true");
      // The control must point at the panel it reveals, or SR users can't find it.
      expect(open.getAttribute("aria-controls")).toBe(
        screen.getByText("Detail for Banana").closest("td")!.id
      );

      await user.click(open);
      expect(screen.queryByText("Detail for Banana")).not.toBeInTheDocument();
    });

    it("keeps only one row expanded at a time", async () => {
      const user = userEvent.setup();
      setup({ expandedContent: (r) => <div>Detail for {r.name}</div> });

      const toggles = screen.getAllByRole("button", { name: /expand details/i });
      await user.click(toggles[0]);
      expect(screen.getByText("Detail for Banana")).toBeInTheDocument();

      await user.click(screen.getAllByRole("button", { name: /expand details/i })[0]);
      expect(screen.queryByText("Detail for Banana")).not.toBeInTheDocument();
      expect(screen.getByText("Detail for Apple")).toBeInTheDocument();
    });

    it("spans the panel across every rendered column", async () => {
      const user = userEvent.setup();
      setup({ selectable: true, expandedContent: () => <div>Panel</div> });

      await user.click(screen.getAllByRole("button", { name: /expand details/i })[0]);
      // 3 data columns + selection column + disclosure column.
      expect(screen.getByText("Panel").closest("td")).toHaveAttribute("colspan", "5");
    });
  });

  describe("server-side pagination", () => {
    const server = { total: 80, offset: 25, limit: 25, onOffsetChange: vi.fn() };

    it("renders every supplied row instead of slicing them again", () => {
      // The caller already fetched exactly one page. Slicing by pageSize here
      // would silently hide rows the server did return.
      setup({ serverPagination: { ...server, offset: 0 }, pageSize: 2 });
      expect(bodyRows()).toHaveLength(3);
    });

    it("reports the true server range, not the loaded row count", () => {
      setup({ serverPagination: server });
      expect(screen.getByText("Showing 26–50 of 80")).toBeInTheDocument();
    });

    it("steps the offset by the page size rather than its own page index", async () => {
      const user = userEvent.setup();
      const onOffsetChange = vi.fn();
      setup({ serverPagination: { ...server, onOffsetChange } });

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(onOffsetChange).toHaveBeenCalledWith(50);

      await user.click(screen.getByRole("button", { name: "Previous" }));
      expect(onOffsetChange).toHaveBeenCalledWith(0);
    });

    it("disables Previous on the first page and Next on the last", () => {
      const { unmount } = setup({ serverPagination: { ...server, offset: 0 } });
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
      unmount();

      setup({ serverPagination: { ...server, offset: 75 } });
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("never clamps the offset below zero", async () => {
      const user = userEvent.setup();
      const onOffsetChange = vi.fn();
      // offset 10 with limit 25 would compute 10-25 = -15 without clamping.
      setup({ serverPagination: { total: 80, offset: 10, limit: 25, onOffsetChange } });
      await user.click(screen.getByRole("button", { name: "Previous" }));
      expect(onOffsetChange).toHaveBeenCalledWith(0);
    });
  });
});

// ── Server-driven sort ───────────────────────────────────────────────────────
// Client sorting reorders the loaded page. On a server-paginated list that
// silently reorders 50 rows of a 5,000-row catalog while looking like it
// reordered the catalog — which is exactly the defect the product list had
// before its search/sort moved server-side. `serverSort` is the alternative.

describe("DataTable — serverSort", () => {
  const SERVER_COLUMNS: DataColumn<Row>[] = [
    { key: "sku", header: "SKU", render: (r) => r.sku, sortKey: "sku" },
    { key: "name", header: "Name", render: (r) => r.name, sortKey: "product_name" },
    { key: "qty", header: "Qty", render: (r) => r.qty, numeric: true },
  ];

  it("calls back with the column's server key instead of reordering rows", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <DataTable
        caption="Products"
        columns={SERVER_COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        serverSort={{ activeKey: "sku", direction: "asc", onSortChange }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    // The server key, not the column key — they differ deliberately here.
    expect(onSortChange).toHaveBeenCalledWith("product_name");

    // Row order must be untouched: the server owns it.
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toBe("APL-002");
  });

  it("reflects the server's active column and direction in aria-sort", () => {
    render(
      <DataTable
        caption="Products"
        columns={SERVER_COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        serverSort={{ activeKey: "product_name", direction: "desc", onSortChange: vi.fn() }}
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    // A default the user never clicked still has to show as sorted, or the
    // header claims the list is unsorted while the server has ordered it.
    expect(headers[1]).toHaveAttribute("aria-sort", "descending");
    expect(headers[0]).toHaveAttribute("aria-sort", "none");
  });

  it("leaves columns without a sortKey unsortable", () => {
    render(
      <DataTable
        caption="Products"
        columns={SERVER_COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        serverSort={{ activeKey: null, direction: "asc", onSortChange: vi.fn() }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Sort by Qty" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")[2]).not.toHaveAttribute("aria-sort");
  });
});

// ── Server pagination with page size ─────────────────────────────────────────

describe("DataTable — serverPagination with onLimitChange", () => {
  it("renders the full shared pager, including rows-per-page", async () => {
    const user = userEvent.setup();
    const onLimitChange = vi.fn();
    const onOffsetChange = vi.fn();
    render(
      <DataTable
        caption="Products"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        serverPagination={{ total: 863, offset: 50, limit: 50, onOffsetChange, onLimitChange }}
      />,
    );

    expect(screen.getByText("51–100 of 863")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Rows per page"), "100");
    expect(onLimitChange).toHaveBeenCalledWith(100);
  });

  it("keeps the bare Prev/Next pager when no page-size handler is given", () => {
    render(
      <DataTable
        caption="Products"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        serverPagination={{ total: 80, offset: 0, limit: 25, onOffsetChange: vi.fn() }}
      />,
    );
    expect(screen.queryByLabelText("Rows per page")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });
});

// ── Controlled selection ─────────────────────────────────────────────────────
// Needed whenever something outside the table reads the selection — a bulk bar
// above it, a print-labels modal, a count in the page header. Without this the
// selection is trapped inside `bulkActions`.

describe("DataTable — controlled selection", () => {
  it("renders the caller's selection and reports changes back", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        caption="Products"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        selectable
        selectedKeys={new Set(["1"])}
        onSelectionChange={onSelectionChange}
      />,
    );

    const boxes = screen.getAllByRole("checkbox");
    // boxes[0] is select-all; row 1 comes from the caller's Set.
    expect(boxes[1]).toBeChecked();
    expect(boxes[2]).not.toBeChecked();

    await user.click(boxes[2]);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["1", "2"]));
  });

  it("select-all reports every row on the page", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        caption="Products"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        selectable
        selectedKeys={new Set()}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(screen.getByLabelText("Select all rows on this page"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["1", "2", "3"]));
  });

  it("still manages its own selection when uncontrolled", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        caption="Products"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        selectable
        bulkActions={(sel) => <span>{sel.length} chosen</span>}
      />,
    );
    await user.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText("1 chosen")).toBeInTheDocument();
  });
});

// ── Controlled expansion ─────────────────────────────────────────────────────
// For rows whose panel is opened by an action button rather than a disclosure —
// the shipments list reveals its "confirm shipment" form from "Mark shipped".

describe("DataTable — controlled expansion", () => {
  it("opens the panel the caller nominates, with no disclosure column", () => {
    render(
      <DataTable
        caption="Rows"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        expandedKey="2"
        onExpandedChange={vi.fn()}
        hideExpandControl
        expandedContent={(r) => (r.id === "2" ? <p>Panel for {r.name}</p> : null)}
      />,
    );
    expect(screen.getByText("Panel for Apple")).toBeInTheDocument();
    // A disclosure button that cannot open anything would be a dead control.
    expect(screen.queryByRole("button", { name: /expand details/i })).not.toBeInTheDocument();
  });

  it("renders no panel row when the content function returns null", () => {
    render(
      <DataTable
        caption="Rows"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        expandedKey="1"
        onExpandedChange={vi.fn()}
        hideExpandControl
        expandedContent={() => null}
      />,
    );
    // 1 header + 3 body rows. An empty panel row would make 5.
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("still self-manages expansion when uncontrolled", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        caption="Rows"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        expandedContent={(r) => <p>Detail {r.sku}</p>}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /expand details/i })[0]);
    expect(screen.getByText("Detail APL-002")).toBeInTheDocument();
  });
});

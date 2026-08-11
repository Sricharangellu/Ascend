/**
 * @vitest-environment jsdom
 *
 * ListControls — behaviour guards for the shared search / column / filter /
 * reset bar.
 *
 * These are deliberately behavioural rather than visual. The failure mode this
 * component exists to prevent is a control that LOOKS right and does nothing —
 * a column selector nobody reads, a Reset that clears three of five filters, a
 * filter popover that traps keyboard users. None of those are caught by a type
 * check or by looking at a screenshot, so they are asserted here.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListControls, type ListSearchField } from "@/components/ListControls";

const FIELDS: ListSearchField[] = [
  { value: "all", label: "All columns" },
  { value: "sku", label: "SKU" },
  { value: "barcode", label: "UPC" },
];

function setup(props: Partial<React.ComponentProps<typeof ListControls>> = {}) {
  const onSearchChange = vi.fn();
  const onSearchFieldChange = vi.fn();
  const onReset = vi.fn();
  const utils = render(
    <ListControls
      search=""
      onSearchChange={onSearchChange}
      searchPlaceholder="Search products, SKU, UPC…"
      searchFields={FIELDS}
      searchField="all"
      onSearchFieldChange={onSearchFieldChange}
      onReset={onReset}
      {...props}
    />,
  );
  return { ...utils, onSearchChange, onSearchFieldChange, onReset };
}

describe("ListControls — search", () => {
  it("labels the search box with what can actually be searched", () => {
    setup();
    // The accessible name must say what is searchable. "Search" alone is why
    // operators do not try typing a UPC into it.
    const input = screen.getByRole("searchbox", { name: /search products, sku, upc/i });
    expect(input).toBeInTheDocument();
  });

  it("shows a clear button only when there is something to clear", async () => {
    const user = userEvent.setup();
    const { rerender, onSearchChange } = setup();
    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();

    rerender(
      <ListControls search="coke" onSearchChange={onSearchChange} searchPlaceholder="Search…" />,
    );
    await user.click(screen.getByRole("button", { name: /clear search/i }));
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("clears on Escape so the keyboard can back out of a search", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(
      <ListControls search="coke" onSearchChange={onSearchChange} searchPlaceholder="Search…" />,
    );
    await user.click(screen.getByRole("searchbox"));
    await user.keyboard("{Escape}");
    expect(onSearchChange).toHaveBeenCalledWith("");
  });
});

describe("ListControls — column scoping", () => {
  it("renders the column selector as a real labelled select", async () => {
    const user = userEvent.setup();
    const { onSearchFieldChange } = setup();
    const select = screen.getByRole("combobox", { name: /search in which column/i });
    // A native select is what gives this keyboard, screen-reader and mobile
    // behaviour for free; a div-based menu has to re-earn all three.
    expect(select.tagName).toBe("SELECT");

    await user.selectOptions(select, "sku");
    expect(onSearchFieldChange).toHaveBeenCalledWith("sku");
  });

  it("renders no selector at all when a list has one searchable field", () => {
    render(
      <ListControls search="" onSearchChange={vi.fn()} searchPlaceholder="Search…" />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("names the active scope in the result count so the narrowing is visible", () => {
    setup({ search: "abc", searchField: "sku", resultCount: 2 });
    // Without this, a search scoped to SKU that returns 2 rows is
    // indistinguishable from a broken search that returns 2 rows.
    expect(screen.getByText(/2 results in SKU/i)).toBeInTheDocument();
  });
});

describe("ListControls — filters", () => {
  it("opens a labelled dialog, closes on Escape, and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    setup({ filters: <label>Category<input /></label> });

    const trigger = screen.getByRole("button", { name: /^filter$/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: /filters/i });
    expect(within(dialog).getByLabelText("Category")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Focus must come back, or a keyboard user is dropped at the top of the page.
    expect(trigger).toHaveFocus();
  });

  it("announces the active filter count rather than showing a bare number", () => {
    setup({ filters: <div />, activeFilterCount: 3 });
    const trigger = screen.getByRole("button", { name: /filter/i });
    expect(trigger).toHaveAccessibleName(/3 active filters/i);
  });

  it("uses the singular for one active filter", () => {
    setup({ filters: <div />, activeFilterCount: 1 });
    expect(screen.getByRole("button", { name: /1 active filter\b/i })).toBeInTheDocument();
  });
});

describe("ListControls — reset", () => {
  it("is disabled, not hidden, when there is nothing to reset", () => {
    setup({ canReset: false });
    // Hiding it would move every control beside it the moment a filter is set.
    expect(screen.getByRole("button", { name: /^reset$/i })).toBeDisabled();
  });

  it("fires once enabled", async () => {
    const user = userEvent.setup();
    const { onReset } = setup({ canReset: true });
    await user.click(screen.getByRole("button", { name: /^reset$/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("ListControls — result count", () => {
  it("reports counts in a polite live region", () => {
    setup({ resultCount: 12, totalCount: 480 });
    const count = screen.getByText(/12 of 480 results/i);
    expect(count).toHaveAttribute("aria-live", "polite");
  });

  it("shows loading instead of a stale count", () => {
    setup({ resultCount: 12, loading: true });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/12 results/i)).not.toBeInTheDocument();
  });
});

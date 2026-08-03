/**
 * Component tests for Input — accessibility.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/Input";

describe("Input", () => {
  it("renders with a visible label", () => {
    render(<Input label="Email" name="email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows a required indicator when required", () => {
    render(<Input label="Email" name="email" required />);
    const label = screen.getByText("Email", { selector: "label" });
    // The required asterisk is inside the label
    expect(label.textContent).toContain("*");
  });

  it("renders hint text linked via aria-describedby", () => {
    render(<Input label="Email" name="email" hint="We'll never share your email" />);
    const input = screen.getByLabelText("Email");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const hintEl = document.getElementById(describedBy!);
    expect(hintEl?.textContent).toContain("We'll never share your email");
  });

  it("shows error text and sets aria-invalid", () => {
    render(<Input label="Email" name="email" error="Invalid email address" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email address");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Input label="Name" name="name" disabled />);
    expect(screen.getByLabelText("Name")).toBeDisabled();
  });
});

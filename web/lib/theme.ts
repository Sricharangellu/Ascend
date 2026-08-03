/**
 * Theme helpers — light/dark mode for marketing/auth surfaces.
 *
 * Persists to localStorage and toggles the `dark` class on <html> so
 * Tailwind's `dark:` variants apply. Defaults to the user's OS preference
 * on first load.
 */

const STORAGE_KEY = "finder-theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

export function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return getStoredTheme() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

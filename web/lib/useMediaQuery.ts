"use client";

import { useEffect, useState } from "react";

/**
 * useMediaQuery — the one place a component asks about the viewport.
 *
 * WHY IT IS NOT JUST `window.matchMedia` INLINE
 * Server rendering has no viewport. A component that reads `matchMedia` during
 * render either crashes on the server or, worse, guesses — and if the guess
 * disagrees with the client, React throws a hydration mismatch and silently
 * re-renders the whole subtree. So this always returns `false` on the first
 * paint and updates in an effect, which means callers must treat `false` as
 * "not known to match yet" and pick their SSR default accordingly.
 *
 * `useIsMobile` therefore renders the DESKTOP branch on the server: showing a
 * complete table for one frame and collapsing it to cards is recoverable,
 * whereas the reverse hides columns from anything that does not run the
 * effect at all (crawlers, JS-off, hydration failure).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

/** Below Tailwind's `md`. Matches the `md:` breakpoint exactly (768px). */
export const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

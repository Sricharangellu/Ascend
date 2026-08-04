/**
 * Compatibility shim for next/navigation.
 * Replaces useRouter, usePathname, useSearchParams with wouter equivalents.
 */
import { useLocation, useParams } from "wouter";

/** Next.js router options (e.g. { scroll: false }). Accepted for compatibility; ignored by wouter. */
type NavigateOptions = { scroll?: boolean };

export function useRouter() {
  const [, navigate] = useLocation();
  return {
    push: (href: string, _options?: NavigateOptions) => navigate(href),
    replace: (href: string, _options?: NavigateOptions) => navigate(href, { replace: true }),
    back: () => history.back(),
    forward: () => history.forward(),
    prefetch: () => {},
    refresh: () => window.location.reload(),
  };
}

export function usePathname() {
  const [location] = useLocation();
  return location;
}

/**
 * Returns URLSearchParams directly (matching Next.js 14 useSearchParams API).
 * Note: Not reactive — call window.location.search for current params.
 */
export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/**
 * Compatibility shim for next/navigation's redirect().
 * Performs a client-side replace so legacy routes forward to their new homes.
 */
export function redirect(href: string): null {
  window.location.replace(href);
  return null;
}

export { useParams };

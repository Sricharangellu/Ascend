/**
 * Compatibility shim for next/navigation.
 * Replaces useRouter, usePathname, useSearchParams with wouter equivalents.
 */
import { useLocation, useParams } from "wouter";

export function useRouter() {
  const [, navigate] = useLocation();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
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

export { useParams };

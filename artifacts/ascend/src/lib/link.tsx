/**
 * Compatibility shim for next/link.
 * Wraps wouter's Link so existing code works unchanged.
 */
import { Link as WouterLink } from "wouter";
import type { ComponentProps } from "react";

type WouterLinkProps = ComponentProps<typeof WouterLink>;

interface NextLinkProps extends Omit<WouterLinkProps, "to" | "href"> {
  href: string;
  children?: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

export default function Link({ href, children, ...props }: NextLinkProps) {
  return (
    <WouterLink href={href} {...props}>
      {children}
    </WouterLink>
  );
}

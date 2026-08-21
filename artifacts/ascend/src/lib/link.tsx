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
  // wouter's LinkProps is a discriminated union on `asChild` (true | false),
  // which a plain `boolean` from our pass-through props can't satisfy
  // statically. Runtime behavior is identical, so cast the rest props.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rest = props as any;
  return (
    <WouterLink href={href} {...rest}>
      {children}
    </WouterLink>
  );
}

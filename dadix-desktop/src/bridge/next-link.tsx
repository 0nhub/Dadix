import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

export default function Link({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  const external = /^https?:\/\//i.test(href);
  if (external) {
    if (/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(href)) {
      return <span {...props}>{children}</span>;
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}

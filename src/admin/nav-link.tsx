import Link from "next/link";
import type { ComponentProps } from "react";

/** A link between admin pages: no prefetching, so a long list does not fetch every footballer. */
export function NavLink(props: ComponentProps<typeof Link>) {
  return <Link prefetch={false} {...props} />;
}

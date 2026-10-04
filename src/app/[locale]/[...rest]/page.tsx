import { notFound } from "next/navigation";

// Unknown paths under a language (/ar/xyz) end here, so they render that
// language's not-found page inside the locale layout (right lang and dir)
// instead of Next's default one. Real routes such as /ar/chkoun win over
// this catch-all.
export default function UnknownPage(): never {
  notFound();
}

import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import { format } from "prettier/standalone";

// The dashboard writes data files as `pnpm format` would leave them (T-AD-2):
// each object keeps the shape its file gave it (opened on one line or not,
// which is all Prettier preserves in JSON), then Prettier does the rest.
// Prettier runs at run time (Open 5), in its standalone build.

type Segment = string | number;

/**
 * For each object of a JSON text, by its path: whether the text opens it on
 * one line (no line break between its `{` and its first key). A path the text
 * did not have takes the layout of its siblings, then of its cousins (the
 * children of its parent's siblings: a new footballer's fields), else open.
 */
export type Layout = {
  exact: Map<string, boolean>;
  children: Map<string, boolean>;
  cousins: Map<string, boolean>;
};

const COUSIN = "\u0000*";
const keyOf = (path: Segment[]) => JSON.stringify(path);
const parentOf = (path: Segment[]) => keyOf(path.slice(0, -1));
/** Any child of any sibling of the parent: a footballer's fields, whichever. */
const cousinOf = (path: Segment[]) =>
  path.length < 2 ? null : keyOf([...path.slice(0, -2), COUSIN]);

function record(layout: Layout, path: Segment[], oneLine: boolean) {
  layout.exact.set(keyOf(path), oneLine);
  if (path.length === 0) return;
  if (!layout.children.has(parentOf(path)))
    layout.children.set(parentOf(path), oneLine);
  const cousin = cousinOf(path);
  if (cousin !== null && !layout.cousins.has(cousin))
    layout.cousins.set(cousin, oneLine);
}

function oneLineAt(layout: Layout, path: Segment[]): boolean {
  const cousin = cousinOf(path);
  return (
    layout.exact.get(keyOf(path)) ??
    (path.length > 0 ? layout.children.get(parentOf(path)) : undefined) ??
    (cousin === null ? undefined : layout.cousins.get(cousin)) ??
    false
  );
}

/** Reads the layout of a JSON text (one that JSON.parse accepts). */
export function layoutOf(text: string): Layout {
  const layout: Layout = {
    exact: new Map(),
    children: new Map(),
    cousins: new Map(),
  };
  let i = 0;
  const space = () => {
    const from = i;
    while (i < text.length && /\s/.test(text[i])) i++;
    return text.slice(from, i);
  };
  const string = (): string => {
    const from = i;
    i++; // the opening quote
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(from, i)) as string;
  };
  const value = (path: Segment[]): void => {
    space();
    const c = text[i];
    if (c === "{") {
      i++;
      const gap = space();
      if (text[i] === "}") {
        i++;
        return;
      }
      record(layout, path, !gap.includes("\n"));
      for (;;) {
        space();
        const key = string();
        space();
        i++; // :
        value([...path, key]);
        space();
        if (text[i++] === "}") return;
      }
    }
    if (c === "[") {
      i++;
      space();
      if (text[i] === "]") {
        i++;
        return;
      }
      for (let n = 0; ; n++) {
        value([...path, n]);
        space();
        if (text[i++] === "]") return;
      }
    }
    if (c === '"') {
      string();
      return;
    }
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
  };
  value([]);
  return layout;
}

function write(value: unknown, path: Segment[], layout: Layout): string {
  if (Array.isArray(value))
    return `[${value.map((v, n) => write(v, [...path, n], layout)).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const members = entries.map(
      ([k, v]) => `${JSON.stringify(k)}: ${write(v, [...path, k], layout)}`,
    );
    return oneLineAt(layout, path)
      ? `{ ${members.join(", ")} }`
      : `{\n${members.join(",\n")}\n}`;
  }
  return JSON.stringify(value);
}

/** `value` as a JSON text in `layout`, as `pnpm format` would leave it. */
export async function writeJson(
  value: unknown,
  layout: Layout,
): Promise<string> {
  return format(write(value, [], layout), {
    parser: "json",
    plugins: [babel, estree],
  });
}

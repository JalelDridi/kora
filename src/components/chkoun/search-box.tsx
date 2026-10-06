"use client";

import { useId, useMemo, useRef, useState } from "react";
import { match, type NameSource, type SearchEntry } from "@/engine/names";
import { localName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";

type Props = {
  locale: Locale;
  entries: SearchEntry[];
  names: Map<string, NameSource>;
  guessed: ReadonlySet<string>;
  disabled: boolean;
  onGuess: (id: string) => void;
  /** Called when a query of two letters or more finds nobody. */
  onNoMatch?: () => void;
  strings: {
    label: string;
    placeholder: string;
    none: string;
    already: string;
    hint: string;
  };
};

// The name search (WAI-ARIA combobox with a listbox popup): everything runs
// in the browser on the page's name list; nothing typed leaves the device.
// Up to five suggestions, each in the locale's script with the Latin name
// under it. Enter or a click guesses the highlighted footballer.
export function SearchBox({
  locale,
  entries,
  names,
  guessed,
  disabled,
  onGuess,
  onNoMatch,
  strings,
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lastNone = useRef(false);
  /** The visitor chose a footballer he has already guessed. */
  const [repeated, setRepeated] = useState(false);

  const results = useMemo(() => match(entries, query, 5), [entries, query]);
  const searched = [...query.trim()].length >= 2;
  const none = searched && results.length === 0;
  const expanded = open && results.length > 0;

  function choose(footballer: string) {
    if (guessed.has(footballer)) {
      setRepeated(true);
      return;
    }
    setRepeated(false);
    onGuess(footballer);
    setQuery("");
    setActive(0);
    setOpen(false);
    input.current?.focus();
  }

  function onChange(value: string) {
    setRepeated(false);
    setQuery(value);
    setActive(0);
    setOpen(true);
    const nowNone =
      [...value.trim()].length >= 2 && match(entries, value, 1).length === 0;
    if (nowNone && !lastNone.current) onNoMatch?.();
    lastNone.current = nowNone;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (expanded && results[active]) choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-base font-semibold">
        {strings.label}
      </label>
      <p id={hintId} className="text-sm text-chalk-dim">
        {strings.hint}
      </p>
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        aria-describedby={hintId}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="go"
        dir="auto"
        disabled={disabled}
        placeholder={strings.placeholder}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="mt-2 block min-h-12 w-full rounded-xl border-2 border-pitch-700 bg-pitch-900 px-4 text-lg text-chalk placeholder:text-chalk-dim focus:border-mint disabled:opacity-60"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={strings.label}
        hidden={!expanded}
        className="absolute inset-x-0 z-10 mt-1 overflow-hidden rounded-xl border-2 border-pitch-700 bg-pitch-900"
      >
        {results.map((footballer, i) => {
          const n = names.get(footballer)!;
          const shown = localName(n, locale);
          const already = guessed.has(footballer);
          return (
            <li
              key={footballer}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={already || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(footballer)}
              className="flex min-h-12 cursor-pointer flex-col justify-center px-4 py-1.5 aria-selected:bg-pitch-700 aria-disabled:cursor-default aria-disabled:opacity-70"
            >
              <span className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
                <bdi>{shown}</bdi>
                {already ? (
                  <span className="text-sm font-normal text-chalk-dim">
                    {strings.already}
                  </span>
                ) : null}
              </span>
              {shown !== n.nameLatin ? (
                <span dir="ltr" className="text-sm text-chalk-dim">
                  {n.nameLatin}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p role="status" className="mt-2 min-h-6 text-base text-chalk-dim">
        {repeated ? strings.already : none ? strings.none : ""}
      </p>
    </div>
  );
}

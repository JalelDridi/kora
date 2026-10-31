"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { match, type NameSource, type SearchEntry } from "@/engine/names";
import { localName } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";

type Props = {
  locale: Locale;
  entries: SearchEntry[];
  names: Map<string, NameSource>;
  guessed: ReadonlySet<string>;
  disabled: boolean;
  /** False until the name list is loaded and indexed. */
  ready: boolean;
  /** The visitor reached the search: load and index the names now. */
  onWant: () => void;
  onGuess: (id: string) => void;
  /** Called when a query of two letters or more finds nobody. */
  onNoMatch?: () => void;
  /**
   * Where the suggestions open: "above" when the search is pinned to the
   * bottom of the screen under the guesses (mobile polish M4), "below"
   * otherwise. Above, the list runs bottom to top, so the first suggestion
   * sits next to the field and Down still moves to the next one.
   */
  placement?: "above" | "below";
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
  ready,
  onWant,
  onGuess,
  onNoMatch,
  placement = "below",
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
  const none = ready && searched && results.length === 0;
  const expanded = open && results.length > 0;
  const above = placement === "above";
  /** Above the field: the room between the top of the screen and the field. */
  const [room, setRoom] = useState<number | null>(null);

  useEffect(() => {
    // The list opening upward never runs above the screen, even with the
    // keyboard open (resizes-content leaves about 400 px): it is capped to
    // the room above the field and scrolls inside. Measured again when the
    // screen changes size (the keyboard) or the page scrolls.
    if (!expanded || !above) return;
    const measure = () => {
      const top = input.current?.getBoundingClientRect().top;
      if (top !== undefined) setRoom(Math.max(96, Math.floor(top) - 12));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [expanded, above]);

  useEffect(() => {
    // Arrow keys keep the active suggestion in sight when the list scrolls.
    if (!expanded) return;
    document
      .getElementById(`${listId}-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, listId]);

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
    onWant();
    setRepeated(false);
    setQuery(value);
    setActive(0);
    setOpen(true);
    const nowNone =
      ready &&
      [...value.trim()].length >= 2 &&
      match(entries, value, 1).length === 0;
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
      {/* Pinned under the guesses, the hint is kept for screen readers only,
          to give the rows more room. */}
      <p id={hintId} className={above ? "sr-only" : "text-sm text-chalk-dim"}>
        {strings.hint}
      </p>
      <div className="relative mt-2">
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
          onFocus={() => {
            onWant();
            setOpen(true);
          }}
          onPointerDown={onWant}
          onBlur={() => setOpen(false)}
          className="block min-h-12 w-full rounded-xl border-2 border-pitch-700 bg-pitch-900 px-4 text-lg text-chalk placeholder:text-chalk-dim focus:border-mint disabled:opacity-60"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={strings.label}
          hidden={!expanded}
          data-placement={placement}
          style={above && room !== null ? { maxBlockSize: room } : undefined}
          className={`absolute inset-x-0 z-10 flex rounded-xl border-2 border-pitch-700 bg-pitch-900 ${
            above
              ? "inset-be-full mb-1 [max-block-size:calc(100dvh-14rem)] flex-col-reverse overflow-y-auto overscroll-contain"
              : "inset-bs-full mt-1 flex-col overflow-hidden"
          }`}
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
      </div>
      <p role="status" className="mt-2 min-h-6 text-base text-chalk-dim">
        {repeated ? strings.already : none ? strings.none : ""}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { OPEN_EVENT, type OpenDetail } from "./header-actions";

type Props = {
  id: string;
  /** The header button that opens it: its `kora:open` detail. */
  name: OpenDetail;
  title: string;
  /** The close button's name. */
  close: string;
  children: ReactNode;
  /** Asked once on mount: true opens the dialog by itself. */
  autoOpen?: () => boolean;
};

// A modal dialog (mobile polish T-MP-2): the native <dialog>, opened with
// showModal(), so the browser makes the rest of the page inert, closes it on
// Escape and gives focus back to the button that opened it; Tab wraps inside
// it (trapTab, below). The header's buttons ask for it with a `kora:open` window event
// (T-MP-3). The close button is its first focusable element and takes focus
// on opening.
export function Dialog({ id, name, title, close, children, autoOpen }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Read once on mount; a new function on each render opens nothing.
  const auto = useRef(autoOpen);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const show = () => {
      if (!dialog.open) dialog.showModal();
    };
    const onOpen = (event: CustomEvent<OpenDetail>) => {
      if (event.detail === name) show();
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    if (auto.current?.()) show();
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [name]);

  const titleId = `${id}-title`;
  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={titleId}
      className="kora-dialog"
      onKeyDown={(event) => trapTab(event.currentTarget, event)}
    >
      <div className="flex items-start gap-2">
        <h2 id={titleId} className="min-w-0 flex-1 pt-2 text-xl font-extrabold">
          {title}
        </h2>
        <button
          type="button"
          autoFocus
          aria-label={close}
          onClick={() => ref.current?.close()}
          className="-me-2 -mt-1 flex size-[44px] shrink-0 items-center justify-center rounded-full text-mint hover:bg-pitch-800 focus-visible:bg-pitch-800"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </dialog>
  );
}

/**
 * Tab and Shift+Tab wrap inside the dialog. The page behind is inert, but
 * the browser lets Tab leave the last control (for its own address bar, or
 * the document itself): the browser test caught focus outside after one Tab.
 */
function trapTab(
  dialog: HTMLDialogElement,
  event: { key: string; shiftKey: boolean; preventDefault: () => void },
) {
  if (event.key !== "Tab") return;
  const focusable = [
    ...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

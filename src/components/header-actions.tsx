"use client";

// The game header's "?" and record buttons (mobile polish T-MP-3). They only
// ask for a dialog: each sends a `kora:open` window event, and the dialog
// that owns the content listens for it. So the header stays a server
// component and the game island stays its own chunk.

export type OpenDetail = "help" | "stats";
export type OpenEvent = CustomEvent<OpenDetail>;
export const OPEN_EVENT = "kora:open";

declare global {
  interface WindowEventMap {
    "kora:open": OpenEvent;
  }
}

type Props = { help: string; stats: string };

const button =
  "flex size-[44px] items-center justify-center rounded-full text-mint hover:bg-pitch-800 focus-visible:bg-pitch-800";

function open(detail: OpenDetail) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail }));
}

export function HeaderActions({ help, stats }: Props) {
  return (
    <>
      <button
        type="button"
        aria-label={help}
        aria-haspopup="dialog"
        onClick={() => open("help")}
        className={button}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9.5" />
          <path d="M9.5 9.25a2.5 2.5 0 1 1 3.5 2.3c-.6.27-1 .86-1 1.52v.43" />
          <path d="M12 17h.01" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={stats}
        aria-haspopup="dialog"
        onClick={() => open("stats")}
        className={button}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M5 20V12M12 20V5M19 20v-5" />
        </svg>
      </button>
    </>
  );
}

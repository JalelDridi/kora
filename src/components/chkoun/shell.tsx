// The game's first paint, rendered on the server (no client code): the same
// boxes as the game while it loads (a state line, then the search block:
// the search field, the guess count and the notice line; then the countdown
// line), inert. The interactive
// game (src/components/chkoun/game.tsx) arrives as a separate island after
// the page has painted, and hides this shell the moment it renders
// (globals.css: .chkoun-live ~ .chkoun-shell). Without JavaScript the
// shell stays, beside the noscript message.

/**
 * The search block's box, shared with the live game (game.tsx), so the
 * field sits at the same height in both. While playing, the game also pins
 * it to the bottom of the screen; the background hides the rows scrolling
 * under it, and the padding keeps it clear of a phone's home bar.
 */
export const SEARCH_BLOCK =
  "bg-pitch-950 pt-2 pb-[env(safe-area-inset-bottom)]";

type Props = {
  label: string;
  hint: string;
  placeholder: string;
  guessCount: string;
};

export function GameShell({ label, hint, placeholder, guessCount }: Props) {
  return (
    <div className="chkoun-shell mt-8 max-w-2xl">
      <div className="mb-3 min-h-12" />
      <div className={SEARCH_BLOCK}>
        <div className="relative">
          <label
            htmlFor="chkoun-shell-search"
            className="block text-base font-semibold"
          >
            {label}
          </label>
          <p id="chkoun-shell-hint" className="text-sm text-chalk-dim">
            {hint}
          </p>
          <div className="relative mt-2">
            <input
              id="chkoun-shell-search"
              type="text"
              disabled
              aria-describedby="chkoun-shell-hint"
              placeholder={placeholder}
              className="block min-h-12 w-full rounded-xl border-2 border-pitch-700 bg-pitch-900 px-4 text-lg text-chalk placeholder:text-chalk-dim disabled:opacity-60"
            />
          </div>
          <p className="mt-2 min-h-6 text-base text-chalk-dim" />
        </div>
        <p className="text-base text-chalk-dim">{guessCount}</p>
        <p className="mt-2 min-h-6 text-base font-semibold" />
      </div>
      <p aria-hidden="true" className="mt-6 min-h-7" />
    </div>
  );
}

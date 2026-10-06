// The game's first paint, rendered on the server (no client code): the same
// boxes as the game while it loads (a state line, the search field, the
// guess count, the notice line, the countdown line), inert. The interactive
// game (src/components/chkoun/game.tsx) arrives as a separate island after
// the page has painted, and hides this shell the moment it renders
// (globals.css: .chkoun-live ~ .chkoun-shell). Without JavaScript the
// shell stays, beside the noscript message.

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
      <div>
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
          <input
            id="chkoun-shell-search"
            type="text"
            disabled
            aria-describedby="chkoun-shell-hint"
            placeholder={placeholder}
            className="mt-2 block min-h-12 w-full rounded-xl border-2 border-pitch-700 bg-pitch-900 px-4 text-lg text-chalk placeholder:text-chalk-dim disabled:opacity-60"
          />
          <p className="mt-2 min-h-6 text-base text-chalk-dim" />
        </div>
        <p className="text-base text-chalk-dim">{guessCount}</p>
      </div>
      <p className="mt-2 min-h-6 text-base font-semibold" />
      <p aria-hidden="true" className="mt-6 min-h-7" />
    </div>
  );
}

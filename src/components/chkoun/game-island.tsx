"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { Game as GameComponent } from "./game";

// The interactive game as an island (perf, round 4): its code is a separate
// chunk, fetched and run only in the browser after the server-rendered shell
// has painted, so the page hydrates almost nothing on load. Until it
// renders, the shell (shell.tsx) stands in its place.
const Game = dynamic(() => import("./game").then((m) => m.Game), {
  ssr: false,
});

export function GameIsland(props: ComponentProps<typeof GameComponent>) {
  return <Game {...props} />;
}

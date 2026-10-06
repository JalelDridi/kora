"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** ISO instant the count reaches zero (the server's next Tunis midnight). */
  endsAt: string;
  /** "Next footballer in {time}". */
  template: string;
  /** Called once when the count reaches zero. */
  onZero?: () => void;
  className?: string;
};

/** H:MM:SS with Western digits, never negative. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Ticks every second towards `endsAt`. The phone's clock only drives the
// display: the server decides the day, and the page asks it again at zero.
export function Countdown({ endsAt, template, onZero, className }: Props) {
  const end = Date.parse(endsAt);
  const [now, setNow] = useState<number | null>(null);
  const fired = useRef(false);
  const zero = useRef(onZero);
  useEffect(() => {
    zero.current = onZero;
  });

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= end && !fired.current) {
        fired.current = true;
        zero.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [end]);

  const [before, after = ""] = template.split("{time}");
  return (
    <p className={className}>
      {before}
      <span dir="ltr" className="tabular-nums">
        {now === null ? "" : clock(end - now)}
      </span>
      {after}
    </p>
  );
}

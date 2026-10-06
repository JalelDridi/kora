import Link from "next/link";

type Props = {
  prefix: string;
  strings: { unofficial: string; sources: string; privacy: string };
};

// Every page under a locale ends with the unofficial line and the links to
// the Sources and privacy pages (plan Task 14).
export function SiteFooter({ prefix, strings }: Props) {
  const link =
    "flex min-h-11 items-center text-base font-semibold text-mint underline-offset-4 hover:underline";
  return (
    <footer className="mx-auto w-full max-w-5xl border-t border-pitch-800 px-4 py-6 sm:px-8">
      <p className="text-base text-chalk-dim">{strings.unofficial}</p>
      <ul className="mt-2 flex flex-wrap gap-x-6">
        <li>
          <Link href={`${prefix}/sources`} prefetch={false} className={link}>
            {strings.sources}
          </Link>
        </li>
        <li>
          <Link href={`${prefix}/privacy`} prefetch={false} className={link}>
            {strings.privacy}
          </Link>
        </li>
      </ul>
    </footer>
  );
}

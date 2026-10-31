import { Fragment, type ReactNode } from 'react';

/** Parole con un trattino interno tra lettere o cifre: "omega-3", "1-2", "30-45". */
const HYPHENATED = /([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+)/gu;

/**
 * Testo in cui le parole con il trattino non vanno mai a capo a metà ("omega-" / "3").
 * Il browser spezza dopo un trattino: qui quelle parole diventano blocchi indivisibili.
 */
export function keepHyphens(text: string): ReactNode {
  if (!text.includes('-')) return text;
  const parts = text.split(HYPHENATED);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <span key={i} className="whitespace-nowrap">
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

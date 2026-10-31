import { Fragment, type ReactNode } from 'react';
import { tidyReply } from '../../../lib/claude';
import { cn } from '../../../ui';

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number };

const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const H_RE = /^\s*#{1,6}\s+(.*)$/;

/** Testo del coach → blocchi: paragrafi ed elenchi (un sottoinsieme minimo e sicuro di markdown). */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = tidyReply(text).replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      if (last) blocks.push({ kind: 'p', lines: [] });
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = OL_RE.exec(line);
    if (ul) {
      if (last?.kind === 'ul') last.items.push(ul[1]);
      else blocks.push({ kind: 'ul', items: [ul[1]] });
      continue;
    }
    if (ol) {
      if (last?.kind === 'ol') last.items.push(ol[2]);
      else blocks.push({ kind: 'ol', items: [ol[2]], start: Number(ol[1]) || 1 });
      continue;
    }
    const h = H_RE.exec(line);
    const content = h ? `**${h[1].replace(/\*\*/g, '')}**` : line;
    // Dopo una riga vuota l'ultimo blocco è un paragrafo vuoto: la riga apre il nuovo paragrafo.
    if (last?.kind === 'p') last.lines.push(content);
    else blocks.push({ kind: 'p', lines: [content] });
  }
  return blocks.filter((b) => (b.kind === 'p' ? b.lines.length > 0 : b.items.length > 0));
}

/** **grassetto** → <strong>; il resto resta testo semplice. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+?)\*\*|__([^_]+?)__/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    out.push(
      <strong key={`${keyBase}-b${i++}`} className="font-semibold">
        {m[1] ?? m[2]}
      </strong>,
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  // Asterischi rimasti da un grassetto non chiuso (durante lo streaming): non si mostrano.
  return out.map((n) => (typeof n === 'string' ? n.replace(/\*\*/g, '') : n));
}

export interface RichTextProps {
  text: string;
  /** Elemento in coda all'ultimo blocco (il cursore dello streaming). */
  tail?: ReactNode;
  className?: string;
}

/** Testo delle risposte: paragrafi brevi, elenchi puntati o numerati, grassetto. */
export function RichText({ text, tail, className }: RichTextProps) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return <p className={className}>{tail}</p>;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {blocks.map((b, bi) => {
        const isLast = bi === blocks.length - 1;
        if (b.kind === 'p') {
          return (
            <p key={bi}>
              {b.lines.map((l, li) => (
                <Fragment key={li}>
                  {li > 0 && <br />}
                  {inline(l, `${bi}-${li}`)}
                </Fragment>
              ))}
              {isLast && tail}
            </p>
          );
        }
        const List = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <List key={bi} className="flex flex-col gap-1" start={b.kind === 'ol' ? b.start : undefined}>
            {b.items.map((it, ii) => (
              <li key={ii} className="relative flex gap-2">
                <span aria-hidden className={cn('shrink-0 select-none', b.kind === 'ul' ? 'mt-[0.62em] size-[5px] rounded-full bg-current opacity-55' : 't-mono mt-[0.18em] min-w-4 text-[0.8125rem] opacity-70')}>
                  {b.kind === 'ol' ? `${(b.start ?? 1) + ii}.` : null}
                </span>
                <span className="min-w-0 flex-1">
                  {inline(it, `${bi}-${ii}`)}
                  {isLast && ii === b.items.length - 1 && tail}
                </span>
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

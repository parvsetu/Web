import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/**
 * Renders the super admin's SEO text without ever treating it as HTML:
 * a blank line starts a paragraph, "## " / "### " start headings, lines
 * starting "- " make a list, **bold**, and [text](/path or https://…) links.
 * Server-safe (no hooks), so it can be part of the static page HTML.
 */
export function SeoText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text?.trim()) return null;
  // A heading line ends its block: "## Title\nText" is a heading, then a paragraph.
  const blocks = text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .flatMap((b) => {
      const t = b.trim();
      const nl = t.indexOf('\n');
      return /^#{2,3} /.test(t) && nl > 0 ? [t.slice(0, nl), t.slice(nl + 1)] : [t];
    });
  return (
    <div className={cx('flex flex-col gap-3 text-[15px] leading-relaxed text-slate-700', className)}>
      {blocks.map((b, i) => {
        const block = b.trim();
        if (block.startsWith('### ')) return <h3 key={i} className="pt-1 text-lg font-bold text-slate-900">{inline(block.slice(4))}</h3>;
        if (block.startsWith('## ')) return <h2 key={i} className="pt-2 text-xl font-extrabold text-slate-900">{inline(block.slice(3))}</h2>;
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-rose-400">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•]\s+/, ''))}</li>)}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index! > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++} className="font-bold text-slate-900">{m[1]}</strong>);
    else {
      const href = m[3];
      if (href.startsWith('/') && !href.startsWith('//')) {
        out.push(<Link key={k++} href={href} className="font-semibold text-rose-700 underline underline-offset-2">{m[2]}</Link>);
      } else if (/^https:\/\//i.test(href)) {
        out.push(<a key={k++} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-rose-700 underline underline-offset-2">{m[2]}</a>);
      } else out.push(m[0]);
    }
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

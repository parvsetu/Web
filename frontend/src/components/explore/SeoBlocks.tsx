import { SeoText } from '../SeoText';

/** Above the festival grid: the page heading (city / category pages) and the intro. */
export function SeoAbove({ title, text }: { title?: string; text?: string | null }) {
  if (!title && !text?.trim()) return null;
  return (
    <section className="mb-6 max-w-3xl">
      {title && <h1 className="text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl">{title}</h1>}
      <SeoText text={text} className={title ? 'mt-2' : undefined} />
    </section>
  );
}

/** Below the festival grid: the longer article. */
export function SeoBelow({ text }: { text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="mt-12 max-w-3xl border-t border-slate-200 pt-8">
      <SeoText text={text} />
    </section>
  );
}

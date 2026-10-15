import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl">🪔</p>
      <h1 className="text-xl font-extrabold">Page not found</h1>
      <p className="text-slate-600">This link may be old or mistyped.</p>
      <Link href="/" className="mt-2 inline-flex min-h-[48px] items-center rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-bold text-white">Explore festivals</Link>
    </main>
  );
}

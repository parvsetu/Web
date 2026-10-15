import { notFound } from 'next/navigation';

/** Unknown URLs: 404 inside the [lang] root layout (styles, fonts), not Next's bare page. */
export default function CatchAll() {
  notFound();
}

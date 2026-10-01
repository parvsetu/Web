/**
 * Writes public/art/<FESTIVAL>.svg from components/FestivalArt so server-side
 * image generation (OG previews, posters) can embed the same artwork.
 * Run after editing FestivalArt:  npx tsx --tsconfig scripts/tsconfig.json scripts/export-art.tsx
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { FestivalArt } from '../src/components/FestivalArt';

import { ART_KEYS } from '../src/components/FestivalArt';

const TYPES = [...ART_KEYS, 'DEFAULT'];
for (const t of TYPES) {
  const svg = renderToStaticMarkup(<FestivalArt type={t === 'DEFAULT' ? null : t} size={512} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true"', '');
  writeFileSync(resolve(__dirname, '../public/art', `${t}.svg`), svg);
}
console.log(`wrote ${TYPES.length} files`);

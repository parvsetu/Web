import { BadRequestException } from '@nestjs/common';

/**
 * Landing page layout: which sections the public /m/<slug> page shows, in what
 * order, and in which visual variant. Stored as LandingPage.layout (JSON array)
 * and always read through normalizeLayout(), so a page saved before a new
 * section type existed still gets it (in its natural place, with defaults) and a section
 * type that is later removed simply disappears.
 */
export const LAYOUT_SECTIONS = {
  hero: { variants: ['DEFAULT'] },
  about: { variants: ['CHIPS', 'LIST'] },
  upcoming: { variants: ['CARDS', 'LIST'] },
  trophies: { variants: ['SHELF', 'GRID'] },
  reviews: { variants: ['CARDS', 'SLIDER'] },
  visitorPhotos: { variants: ['DEFAULT'] },
  gallery: { variants: ['GRID', 'CAROUSEL'] },
  /** Photos approved from the mandal's connected Instagram. */
  instagram: { variants: ['GRID', 'CAROUSEL'] },
  past: { variants: ['DEFAULT'] },
  sponsors: { variants: ['DEFAULT'] },
  contact: { variants: ['DEFAULT'] },
} as const satisfies Record<string, { variants: readonly string[] }>;

export type LayoutSectionId = keyof typeof LAYOUT_SECTIONS;
export interface LayoutSection {
  id: LayoutSectionId;
  visible: boolean;
  variant: string;
}

/** The page's original order, with the new sections slotted in where they read naturally. */
export const DEFAULT_LAYOUT_ORDER: LayoutSectionId[] = ['hero', 'about', 'upcoming', 'trophies', 'reviews', 'gallery', 'instagram', 'visitorPhotos', 'past', 'sponsors', 'contact'];

export const isSectionId = (id: unknown): id is LayoutSectionId => typeof id === 'string' && Object.prototype.hasOwnProperty.call(LAYOUT_SECTIONS, id);

const defaultSection = (id: LayoutSectionId): LayoutSection => ({ id, visible: true, variant: LAYOUT_SECTIONS[id].variants[0] });

export function defaultLayout(): LayoutSection[] {
  return DEFAULT_LAYOUT_ORDER.map(defaultSection);
}

/**
 * Lenient read of whatever is stored (never throws): unknown ids and duplicates
 * are dropped, bad variants fall back to the section's default, missing
 * sections are inserted after their default predecessor, and the hero is always first and visible.
 */
export function normalizeLayout(raw: unknown, missing: 'insert' | 'append' = 'insert'): LayoutSection[] {
  const seen = new Set<LayoutSectionId>();
  const out: LayoutSection[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const { id, visible, variant } = item as Record<string, unknown>;
    if (!isSectionId(id) || seen.has(id)) continue;
    seen.add(id);
    const variants: readonly string[] = LAYOUT_SECTIONS[id].variants;
    out.push({ id, visible: visible !== false, variant: typeof variant === 'string' && variants.includes(variant) ? variant : variants[0] });
  }
  // Reading a stored layout: a section it doesn't know yet (added to Parvsetu later) goes right after the section
  // that precedes it in the default order — a new "instagram" lands after "gallery", not at the bottom.
  // Saving (validateLayout): the client's order comes first and anything it left out is appended.
  DEFAULT_LAYOUT_ORDER.forEach((id, i) => {
    if (seen.has(id)) return;
    if (missing === 'append') {
      out.push(defaultSection(id));
      seen.add(id);
      return;
    }
    const prev = DEFAULT_LAYOUT_ORDER.slice(0, i).reverse().find((p) => out.some((s) => s.id === p));
    out.splice(prev ? out.findIndex((s) => s.id === prev) + 1 : 0, 0, defaultSection(id));
    seen.add(id);
  });
  return heroFirst(out);
}

function heroFirst(list: LayoutSection[]) {
  const hero = list.find((s) => s.id === 'hero')!;
  return [{ ...hero, visible: true }, ...list.filter((s) => s.id !== 'hero')];
}

/**
 * Strict check of a layout the mandal saves. Unknown ids are dropped (an older
 * or newer client may know other sections), a repeated id or a variant outside
 * the section's allow-list is a 400, and the hero is moved first and kept visible.
 */
export function validateLayout(input: { id: string; visible: boolean; variant?: string }[]): LayoutSection[] {
  const seen = new Set<string>();
  const kept: LayoutSection[] = [];
  for (const s of input) {
    if (!isSectionId(s.id)) continue;
    if (seen.has(s.id)) throw new BadRequestException(`Section "${s.id}" appears more than once.`);
    seen.add(s.id);
    const variants: readonly string[] = LAYOUT_SECTIONS[s.id].variants;
    const variant = s.variant ?? variants[0];
    if (!variants.includes(variant)) throw new BadRequestException(`"${variant}" is not a layout for the ${s.id} section (use ${variants.join(' or ')}).`);
    kept.push({ id: s.id, visible: s.visible, variant });
  }
  return normalizeLayout(kept, 'append');
}

export const LAYOUT_CATALOG = Object.fromEntries(Object.entries(LAYOUT_SECTIONS).map(([id, d]) => [id, d.variants])) as unknown as Record<LayoutSectionId, readonly string[]>;

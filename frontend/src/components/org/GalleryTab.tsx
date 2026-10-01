'use client';

import { useState } from 'react';
import { ArrowLeft, Camera, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import { useAuthedImage } from '@/lib/images';
import { fmtRange } from '@/lib/public-festival';
import type { GallerySummary, Photo } from '@/lib/gallery-types';
import type { Paged } from '@/lib/types';
import { FestivalBadge } from '../FestivalBanner';
import { Alert, Button, Card, Empty, Pager, SectionTitle, SkeletonList } from '../ui';
import { PhotoGrid, UsageBar } from '../gallery/PhotoGrid';

/** All the mandal's festival photos, year by year → festival, to look back next season. */
export function GalleryTab() {
  const org = useOrg();
  const q = useAsync(() => api.get<GallerySummary>(`/organizations/${org.orgId}/photos/summary`), [org.orgId]);
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);

  if (open) return <EventPhotos event={open} onBack={() => { setOpen(null); q.reload(); }} />;
  if (q.error) return <Alert>{q.error}</Alert>;
  if (!q.data) return <SkeletonList />;
  return (
    <div className="flex flex-col gap-4">
      <Card><UsageBar usage={q.data.usage} /></Card>
      {q.data.years.length === 0 ? (
        <Empty title="No photos yet" icon={Camera}>Open a festival → Photos to upload pictures. They will be collected here by year.</Empty>
      ) : (
        q.data.years.map((y) => (
          <section key={y.year}>
            <SectionTitle>{y.year}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {y.events.map((e) => (
                <button key={e.id} type="button" onClick={() => setOpen({ id: e.id, name: e.name })} className="overflow-hidden rounded-2xl border border-orange-100 bg-white text-left shadow-sm hover:shadow-md">
                  <Cover path={e.coverThumbUrl} />
                  <div className="flex items-center gap-2 p-3">
                    <FestivalBadge type={e.festivalType} className="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="truncate font-bold">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {fmtRange(e.startDate, e.endDate)} · {e.photos} photos{e.publicPhotos ? ` · ${e.publicPhotos} public` : ''}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Cover({ path }: { path: string | null }) {
  const src = useAuthedImage(path);
  return (
    <div className="aspect-[16/9] w-full bg-gradient-to-br from-amber-100 to-rose-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

function EventPhotos({ event, onBack }: { event: { id: string; name: string }; onBack: () => void }) {
  const org = useOrg();
  const [page, setPage] = useState(1);
  const [onlyPublic, setOnlyPublic] = useState(false);
  const q = useAsync(
    () => api.get<Paged<Photo>>(`/organizations/${org.orgId}/photos`, { eventId: event.id, page, pageSize: 48, public: onlyPublic || undefined }),
    [org.orgId, event.id, page, onlyPublic],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={onBack}><ArrowLeft aria-hidden className="h-4 w-4" /> All years</Button>
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={onlyPublic} onChange={(e) => { setOnlyPublic(e.target.checked); setPage(1); }} />
          <Globe aria-hidden className="h-4 w-4" /> Only public
        </label>
      </div>
      <h2 className="text-lg font-bold">{event.name}</h2>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList rows={2} /> : <PhotoGrid photos={q.data?.items ?? []} canManage={can(org.perms, 'GALLERY_MANAGE')} onChanged={q.reload} />}
      {q.data && <Pager page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </div>
  );
}

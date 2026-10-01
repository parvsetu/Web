'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { GalleryUsage, Photo } from '@/lib/gallery-types';
import type { Paged } from '@/lib/types';
import { Alert, Card, Pager, SkeletonList } from '../ui';
import { PhotoGrid, PhotoUploader, UsageBar } from '../gallery/PhotoGrid';

/** Festival photos: upload from the phone, caption, publish to the public festival page, delete. */
export function PhotosTab() {
  const ev = useEvent();
  const manage = can(ev.perms, 'GALLERY_MANAGE');
  const [page, setPage] = useState(1);
  const [onlyPublic, setOnlyPublic] = useState(false);
  const q = useAsync(
    () => api.get<Paged<Photo> & { usage: GalleryUsage }>(`/events/${ev.eventId}/photos`, { page, pageSize: 48, public: onlyPublic || undefined }),
    [ev.eventId, page, onlyPublic],
  );
  const [usage, setUsage] = useState<GalleryUsage | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <UsageBar usage={usage ?? q.data?.usage} />
        {manage && (
          <PhotoUploader
            eventId={ev.eventId}
            onUploaded={(u) => {
              setUsage(u);
              setPage(1);
              q.reload();
            }}
          />
        )}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Public photos appear on the festival page and can be shown on your mandal&apos;s landing page.</p>
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={onlyPublic} onChange={(e) => { setOnlyPublic(e.target.checked); setPage(1); }} />
          Only public
        </label>
      </div>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList rows={2} /> : <PhotoGrid photos={q.data?.items ?? []} canManage={manage} onChanged={() => { setUsage(null); q.reload(); }} />}
      {q.data && <Pager page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </div>
  );
}

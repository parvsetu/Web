/** Visitor reviews: who can post, the window, photos & quota, auto-flagging, moderation, public output, reports. */
import { randomBytes } from 'crypto';
import { GALLERY_QUOTA_BYTES } from '../src/common/images/image-info';
import { assign, bearer, bootApp, fakePng, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Visitor reviews (e2e)', () => {
  let ctx: TestCtx;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
  });
  afterAll(() => ctx.app.close());

  const day = (offset: number) => new Date(`${new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`);

  async function mandal(dates?: { start: number; end: number }) {
    const m = await makeOrgWithEvent(ctx.prisma);
    if (dates) await ctx.prisma.event.update({ where: { id: m.event.id }, data: { startDate: day(dates.start), endDate: day(dates.end) } });
    const slot = await ctx.prisma.timeSlot.create({ data: { eventId: m.event.id, label: 'Day 10-20', startTime: '10:00', endTime: '20:00', price: '50' } });
    return { ...m, slot, auth: bearer(ctx, m.admin) };
  }

  let orderSeq = 0;
  async function order(m: Awaited<ReturnType<typeof mandal>>, status: 'PAID' | 'PENDING' = 'PAID', buyerName = 'Rohit Kumar Sharma') {
    orderSeq++;
    return ctx.prisma.passOrder.create({ data: {
      eventId: m.event.id, timeSlotId: m.slot.id, validFrom: new Date(), validUntil: new Date(Date.now() + 3600_000), visitorCount: 1,
      buyerName, buyerMobile: '9876543210', unitPrice: '50', baseAmount: '50', amount: '50', status, paymentProvider: 'demo',
      providerOrderId: `t_${randomBytes(6).toString('hex')}_${orderSeq}`, accessKey: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + 600_000), paidAt: status === 'PAID' ? new Date() : null,
    } });
  }

  type Fields = { rating?: string; text?: string; displayName?: string; consent?: string; keepPhotoIds?: string };
  function post(o: { id: string; accessKey: string }, f: Fields = {}, photos = 0, method: 'post' | 'put' = 'post', key = o.accessKey) {
    let r = ctx.http()[method](api(`/public/booking/orders/${o.id}/review`))
      .field('k', key).field('rating', f.rating ?? '5').field('displayName', f.displayName ?? 'Rohit S.').field('consent', f.consent ?? 'true');
    if (f.text !== undefined) r = r.field('text', f.text);
    if (f.keepPhotoIds !== undefined) r = r.field('keepPhotoIds', f.keepPhotoIds);
    for (let i = 0; i < photos; i++) r = r.attach('files', fakePng(1600, 1200, 40_000), `p${i}.png`).attach('thumbs', fakePng(400, 300, 5_000), `t${i}.png`);
    return r;
  }

  it('only a paid order holder can post, once, inside the festival window; edits allowed while pending', async () => {
    const m = await mandal();
    const o = await order(m);
    // The pass page asks first: eligibility + the suggested public name.
    const info = await ctx.http().get(api(`/public/booking/orders/${o.id}/review`)).query({ k: o.accessKey });
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ canSubmit: true, reason: null, defaultDisplayName: 'Rohit S.', review: null, consent: { version: expect.any(String) } });
    expect((await ctx.http().get(api(`/public/booking/orders/${o.id}/review`)).query({ k: 'x'.repeat(32) })).status).toBe(404);

    expect((await post(o, {}, 0, 'post', 'y'.repeat(32))).status).toBe(404);
    const unpaid = await order(m, 'PENDING');
    const u = await post(unpaid);
    expect(u.status).toBe(403);
    expect(u.body.code).toBe('ORDER_NOT_PAID');
    expect((await ctx.http().get(api(`/public/booking/orders/${unpaid.id}/review`)).query({ k: unpaid.accessKey })).body).toMatchObject({ canSubmit: false, reason: 'NOT_PAID' });

    const noConsent = await post(o, { consent: 'false' });
    expect(noConsent.status).toBe(400);
    expect((await post(o, { rating: '6' })).status).toBe(400);
    expect((await post(o, { text: 'x'.repeat(501) })).status).toBe(400);
    expect((await post(o, { displayName: 'Rohit 9876543210' })).status).toBe(400);

    const ok = await post(o, { text: 'Lovely darshan, very well managed.' }, 2);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'PENDING', rating: 5, displayName: 'Rohit S.', editable: true, photosRejected: null });
    expect(ok.body.photos).toHaveLength(2);
    const own = await ctx.http().get(api(ok.body.photos[0].thumbUrl));
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('image/png');
    // Stored consent version + time.
    const row = await ctx.prisma.visitorReview.findUniqueOrThrow({ where: { passOrderId: o.id } });
    expect(row.consentVersion).toMatch(/^review-consent-/);
    expect(row.flagged).toBe(false);

    const again = await post(o);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('REVIEW_EXISTS');

    // Edit while pending: keep one photo, add two (3 max), new rating.
    const edit = await post(o, { rating: '4', text: 'Edited', keepPhotoIds: JSON.stringify([ok.body.photos[0].id]) }, 2, 'put');
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ rating: 4, text: 'Edited' });
    expect(edit.body.photos).toHaveLength(3);
    expect((await post(o, { keepPhotoIds: JSON.stringify(edit.body.photos.map((p: { id: string }) => p.id)) }, 1, 'put')).status).toBe(400);

    // Nothing is public before approval.
    const pub = await ctx.http().get(api(`/public/events/${m.event.id}/reviews`));
    expect(pub.body).toMatchObject({ total: 0, summary: { average: null, count: 0 } });

    // Approved → locked for the visitor.
    await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${ok.body.id}/approve`)).set('Authorization', m.auth).send({});
    const locked = await post(o, {}, 0, 'put');
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('REVIEW_LOCKED');
  });

  it('window: before the first day and more than 30 days after the end → 409', async () => {
    const future = await mandal({ start: 3, end: 5 });
    const early = await post(await order(future));
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('REVIEW_NOT_OPEN');

    const ended = await mandal({ start: -40, end: -31 });
    await ctx.prisma.event.update({ where: { id: ended.event.id }, data: { status: 'COMPLETED' } });
    const late = await post(await order(ended));
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('REVIEW_WINDOW_CLOSED');

    const recent = await mandal({ start: -35, end: -29 });
    await ctx.prisma.event.update({ where: { id: recent.event.id }, data: { status: 'COMPLETED' } });
    expect((await post(await order(recent))).status).toBe(201);
  });

  it('photos are rejected (text kept) when the mandal storage quota is full', async () => {
    const m = await mandal();
    await ctx.prisma.eventPhoto.create({ data: {
      organizationId: m.org.id, eventId: m.event.id, imageKey: `fake/${randomBytes(4).toString('hex')}`, mimeType: 'image/png', width: 10, height: 10,
      sizeBytes: GALLERY_QUOTA_BYTES - 10_000,
    } });
    const r = await post(await order(m), { text: 'Great!' }, 2);
    expect(r.status).toBe(201);
    expect(r.body.photos).toHaveLength(0);
    expect(r.body.photosRejected).toMatchObject({ code: 'PHOTO_STORAGE_FULL' });
    expect(r.body.text).toBe('Great!');
  });

  it('abuse words and links/phones are auto-flagged and highlighted in the queue', async () => {
    const m = await mandal();
    await post(await order(m), { text: 'organisers are chutiya, book cheap at www.deals.in or call 98765 43210' });
    await post(await order(m), { text: 'Wonderful evening' });
    const list = await ctx.http().get(api(`/events/${m.event.id}/reviews`)).query({ status: 'PENDING' }).set('Authorization', m.auth);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    // Flagged first in the pending queue.
    expect(list.body.items[0]).toMatchObject({ flagged: true, status: 'PENDING' });
    expect(list.body.items[0].flagReasons).toEqual(expect.arrayContaining(['ABUSIVE_LANGUAGE', 'CONTAINS_LINK', 'CONTAINS_PHONE']));
    expect(list.body.items[1].flagged).toBe(false);
    expect(list.body.counts).toMatchObject({ PENDING: 2, flaggedPending: 1 });
    // Contact details are never in the moderation payload either.
    expect(JSON.stringify(list.body)).not.toContain('9876543210');
  });

  it('moderation permissions: volunteer denied, report viewer read-only, stranger 404', async () => {
    const m = await mandal();
    const r = await post(await order(m));
    const vol = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, vol.id, 'VOLUNTEER');
    expect((await ctx.http().get(api(`/events/${m.event.id}/reviews`)).set('Authorization', bearer(ctx, vol))).status).toBe(403);
    expect((await ctx.http().post(api(`/events/${m.event.id}/reviews/${r.body.id}/approve`)).set('Authorization', bearer(ctx, vol)).send({})).status).toBe(403);
    const viewer = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, viewer.id, 'REPORT_VIEWER');
    expect((await ctx.http().get(api(`/events/${m.event.id}/reviews`)).set('Authorization', bearer(ctx, viewer))).status).toBe(200);
    expect((await ctx.http().post(api(`/events/${m.event.id}/reviews/${r.body.id}/approve`)).set('Authorization', bearer(ctx, viewer)).send({})).status).toBe(403);
    const stranger = await makeUser(ctx.prisma);
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/reviews`)).set('Authorization', bearer(ctx, stranger))).status).toBe(404);
    // Another mandal can't address this review through its own scope.
    const other = await mandal();
    expect((await ctx.http().post(api(`/organizations/${other.org.id}/reviews/${r.body.id}/approve`)).set('Authorization', other.auth).send({})).status).toBe(404);
  });

  it('approve (with chosen photos) → public; hide → gone; feature max 6; delete removes bytes; all audited', async () => {
    const m = await mandal();
    const o = await order(m);
    const r = await post(o, { text: 'Superb arrangements' }, 2);
    const [keep, drop] = r.body.photos.map((p: { id: string }) => p.id);
    const ap = await ctx.http().post(api(`/events/${m.event.id}/reviews/${r.body.id}/approve`)).set('Authorization', m.auth).send({ photoIds: [keep] });
    expect(ap.status).toBe(200);
    expect(ap.body).toMatchObject({ status: 'APPROVED', moderatedBy: { id: m.admin.id } });

    const pub = await ctx.http().get(api(`/public/events/${m.event.id}/reviews`));
    expect(pub.body).toMatchObject({ total: 1, summary: { average: 5, count: 1 } });
    expect(pub.body.items[0]).toMatchObject({ displayName: 'Rohit S.', rating: 5, text: 'Superb arrangements', event: { id: m.event.id } });
    expect(pub.body.items[0].photos.map((p: { id: string }) => p.id)).toEqual([keep]);
    expect(JSON.stringify(pub.body)).not.toMatch(/9876543210|Sharma|accessKey/);
    expect((await ctx.http().get(api(`/public/review-photos/${keep}/image?size=thumb`))).status).toBe(200);
    expect((await ctx.http().get(api(`/public/review-photos/${drop}/image`))).status).toBe(404);

    // Landing page (active) carries the summary, cards and the visitor photo wall.
    await ctx.prisma.landingPage.create({ data: { organizationId: m.org.id, paidUntil: new Date(Date.now() + 86400000 * 30) } });
    const land = await ctx.http().get(api(`/public/landing/${m.org.slug}`));
    expect(land.body.reviews).toMatchObject({ average: 5, count: 1, total: 1 });
    expect(land.body.visitorPhotos).toMatchObject({ total: 1, items: [{ id: keep, displayName: 'Rohit S.' }] });
    expect((await ctx.http().get(api(`/public/landing/${m.org.slug}/reviews`)).query({ page: 1, pageSize: 5 })).body.total).toBe(1);

    // Per-photo publish/unpublish and remove.
    await ctx.http().patch(api(`/organizations/${m.org.id}/reviews/${r.body.id}/photos/${drop}`)).set('Authorization', m.auth).send({ approved: true });
    expect((await ctx.http().get(api(`/public/review-photos/${drop}/image`))).status).toBe(200);
    const dropRow = await ctx.prisma.reviewPhoto.findUniqueOrThrow({ where: { id: drop } });
    const rm = await ctx.http().delete(api(`/organizations/${m.org.id}/reviews/${r.body.id}/photos/${drop}`)).set('Authorization', m.auth);
    expect(rm.body.photos).toHaveLength(1);
    expect(await ctx.prisma.storedImage.findUnique({ where: { key: dropRow.imageKey } })).toBeNull();

    // Feature, then hide (unfeatures), then gone publicly.
    expect((await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${r.body.id}/feature`)).set('Authorization', m.auth).send({ featured: true })).body.featured).toBe(true);
    const hide = await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${r.body.id}/hide`)).set('Authorization', m.auth).send({ note: 'Old festival' });
    expect(hide.body).toMatchObject({ status: 'HIDDEN', featured: false });
    expect((await ctx.http().get(api(`/public/events/${m.event.id}/reviews`))).body.total).toBe(0);
    expect((await ctx.http().get(api(`/public/review-photos/${keep}/image`))).status).toBe(404);
    // Hiding is only for approved reviews; rejecting a pending one works.
    const p2 = await post(await order(m));
    expect((await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${p2.body.id}/hide`)).set('Authorization', m.auth).send({})).status).toBe(409);
    expect((await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${p2.body.id}/reject`)).set('Authorization', m.auth).send({ note: 'Not about the festival' })).body.status).toBe('REJECTED');
    const mine = await ctx.http().get(api(`/public/booking/orders/${(await ctx.prisma.visitorReview.findUniqueOrThrow({ where: { id: p2.body.id } })).passOrderId}/review`))
      .query({ k: (await ctx.prisma.passOrder.findFirstOrThrow({ where: { review: { id: p2.body.id } } })).accessKey });
    expect(mine.body.review).toMatchObject({ status: 'REJECTED', moderationNote: 'Not about the festival', editable: false });

    // Featured max 6 per mandal.
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push((await post(await order(m))).body.id);
    for (const id of ids) await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${id}/approve`)).set('Authorization', m.auth).send({});
    for (const id of ids.slice(0, 6)) expect((await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${id}/feature`)).set('Authorization', m.auth).send({ featured: true })).status).toBe(200);
    const seventh = await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${ids[6]}/feature`)).set('Authorization', m.auth).send({ featured: true });
    expect(seventh.status).toBe(409);
    expect(seventh.body.code).toBe('FEATURE_LIMIT');
    // Featured first publicly.
    const list = await ctx.http().get(api(`/public/events/${m.event.id}/reviews`)).query({ pageSize: 10 });
    expect(list.body.items.slice(0, 6).every((x: { featured: boolean }) => x.featured)).toBe(true);
    expect(list.body.items[6].featured).toBe(false);

    // Delete: review and all its photo bytes go.
    const keepRow = await ctx.prisma.reviewPhoto.findUniqueOrThrow({ where: { id: keep } });
    expect((await ctx.http().delete(api(`/organizations/${m.org.id}/reviews/${r.body.id}`)).set('Authorization', m.auth)).status).toBe(204);
    expect(await ctx.prisma.storedImage.findUnique({ where: { key: keepRow.imageKey } })).toBeNull();

    const actions = (await ctx.prisma.auditLog.findMany({ where: { organizationId: m.org.id, entityType: { in: ['VisitorReview', 'ReviewPhoto'] } } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['review.approved', 'review.photo_approved', 'review.photo_removed', 'review.featured', 'review.hidden', 'review.rejected', 'review.deleted']));
  });

  it('3 reports from different visitors auto-hide; super admin sees, restores or removes (audited)', async () => {
    const m = await mandal();
    const r = await post(await order(m), { text: 'Fine' });
    await ctx.http().post(api(`/organizations/${m.org.id}/reviews/${r.body.id}/approve`)).set('Authorization', m.auth).send({});
    const report = (ip: string) => ctx.http().post(api(`/public/reviews/${r.body.id}/report`)).set('X-Forwarded-For', ip).send({ reason: 'FAKE', note: 'Never visited' });
    expect((await report('10.0.0.1')).status).toBe(200);
    expect((await report('10.0.0.1')).status).toBe(200); // same reporter: counted once
    expect((await ctx.prisma.visitorReview.findUniqueOrThrow({ where: { id: r.body.id } })).reportCount).toBe(1);
    expect((await ctx.http().post(api(`/public/reviews/${r.body.id}/report`)).send({ reason: 'BAD' })).status).toBe(400);
    await report('10.0.0.2');
    expect((await ctx.http().get(api(`/public/events/${m.event.id}/reviews`))).body.total).toBe(1);
    await report('10.0.0.3');
    const hidden = await ctx.prisma.visitorReview.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(hidden).toMatchObject({ status: 'HIDDEN', reportCount: 3 });
    expect(hidden.autoHiddenAt).not.toBeNull();
    expect((await ctx.http().get(api(`/public/events/${m.event.id}/reviews`))).body.total).toBe(0);
    // A hidden review can't be reported further.
    expect((await report('10.0.0.4')).status).toBe(404);

    // Mandal sees it auto-hidden; platform sees it in the reported list.
    const q = await ctx.http().get(api(`/organizations/${m.org.id}/reviews`)).query({ status: 'HIDDEN' }).set('Authorization', m.auth);
    expect(q.body.items[0]).toMatchObject({ autoHidden: true, reportCount: 3 });
    expect((await ctx.http().get(api('/platform/reviews/reported')).set('Authorization', m.auth)).status).toBe(403);
    const plat = await ctx.http().get(api('/platform/reviews/reported')).set('Authorization', sa);
    const item = plat.body.items.find((x: { id: string }) => x.id === r.body.id);
    expect(item).toMatchObject({ organization: { id: m.org.id }, reportCount: 3 });
    expect(item.reports).toHaveLength(3);

    const restore = await ctx.http().post(api(`/platform/reviews/${r.body.id}/restore`)).set('Authorization', sa);
    expect(restore.status).toBe(200);
    expect(await ctx.prisma.visitorReview.findUniqueOrThrow({ where: { id: r.body.id } })).toMatchObject({ status: 'APPROVED', reportCount: 0, autoHiddenAt: null });
    expect((await ctx.http().get(api(`/public/events/${m.event.id}/reviews`))).body.total).toBe(1);
    // Earlier reporters' reports are resolved; new ones count afresh.
    await report('10.0.0.5');
    expect((await ctx.prisma.visitorReview.findUniqueOrThrow({ where: { id: r.body.id } })).reportCount).toBe(1);

    expect((await ctx.http().post(api(`/platform/reviews/${r.body.id}/remove`)).set('Authorization', sa).send({})).status).toBe(400);
    expect((await ctx.http().post(api(`/platform/reviews/${r.body.id}/remove`)).set('Authorization', sa).send({ reason: 'Fake review confirmed' })).status).toBe(204);
    expect(await ctx.prisma.visitorReview.findUnique({ where: { id: r.body.id } })).toBeNull();
    const audits = (await ctx.prisma.auditLog.findMany({ where: { entityId: r.body.id } })).map((a) => a.action);
    expect(audits).toEqual(expect.arrayContaining(['review.auto_hidden', 'review.reports_dismissed', 'review.removed_by_platform']));
  });
});

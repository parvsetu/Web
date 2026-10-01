'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Mail, MessageCircle, Share2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtMoney } from '@/lib/format';
import type { ReceiptShare } from '@/lib/types';
import { Alert, Button, Modal, cx } from './ui';

interface Props {
  eventId: string;
  donationId: string;
  donorName: string;
  donorEmail: string | null;
  amount: string;
  eventName: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** "Share receipt" (secret public link → WhatsApp / copy / share sheet) and "Email to donor". */
export function ReceiptShareActions({ eventId, donationId, donorName, donorEmail, amount, eventName, size = 'md', className }: Props) {
  const [link, setLink] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function share() {
    setMsg(null);
    if (link) return setOpen(true);
    setSharing(true);
    try {
      const r = await api.post<ReceiptShare>(`/events/${eventId}/donations/${donationId}/share`);
      setLink(window.location.origin + r.path);
      setOpen(true);
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSharing(false);
    }
  }

  async function email() {
    if (!donorEmail) return;
    setMsg(null);
    setEmailing(true);
    try {
      await api.post<{ sent: boolean }>(`/events/${eventId}/donations/${donationId}/email-receipt`);
      setMsg({ kind: 'success', text: `Receipt emailed to ${donorEmail}.` });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setEmailing(false);
    }
  }

  const text = `🙏 Thank you, ${donorName}, for your donation of ${fmtMoney(amount)} to ${eventName}. Here is your receipt:`;

  return (
    <div className={cx('no-print flex flex-col gap-2', className)}>
      <div className="flex flex-wrap gap-2">
        <Button size={size === 'sm' ? 'sm' : 'md'} variant="secondary" loading={sharing} onClick={() => void share()}>
          <Share2 aria-hidden className="h-4 w-4" /> Share receipt
        </Button>
        {donorEmail && (
          <Button size={size === 'sm' ? 'sm' : 'md'} variant="secondary" loading={emailing} onClick={() => void email()}>
            <Mail aria-hidden className="h-4 w-4" /> Email to donor
          </Button>
        )}
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {open && link && <ShareModal link={link} text={text} title={`Receipt for ${donorName}`} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ShareModal({ link, text, title, onClose }: { link: string; text: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Anyone with this link can view and download the receipt — no login needed. Send it only to the donor.</p>
        <div className="flex items-center gap-2 rounded-xl bg-orange-50 p-2 ring-1 ring-orange-200">
          <input readOnly value={link} aria-label="Receipt link" onFocus={(e) => e.target.select()} className="min-h-[44px] min-w-0 flex-1 bg-transparent px-2 font-mono text-xs text-slate-800 focus:outline-none" />
          <button type="button" onClick={() => void copy()} aria-label="Copy link" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-orange-200">
            {copied ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Copy aria-hidden className="h-4 w-4" />}
          </button>
        </div>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-white shadow-sm"
        >
          <MessageCircle aria-hidden className="h-5 w-5" /> Send on WhatsApp
        </a>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void copy()} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white font-semibold text-slate-800">
            {copied ? <Check aria-hidden className="h-5 w-5 text-green-600" /> : <Copy aria-hidden className="h-5 w-5" />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          {canShare ? (
            <button
              type="button"
              onClick={() => void navigator.share({ title, text, url: link }).catch(() => undefined)}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white font-semibold text-slate-800"
            >
              <Share2 aria-hidden className="h-5 w-5" /> More…
            </button>
          ) : (
            <a href={link} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white font-semibold text-slate-800">
              <ExternalLink aria-hidden className="h-5 w-5" /> Open
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

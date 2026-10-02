'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth';
import type { Lang } from '@/lib/i18n/config';
import type { Messages } from '@/lib/i18n/core';
import { LanguageProvider } from '@/lib/i18n/provider';

function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
}

export function Providers({ children, lang, messages }: { children: React.ReactNode; lang: Lang; messages: Messages | null }) {
  useServiceWorker();
  return (
    <LanguageProvider initialLang={lang} initialMessages={messages}>
      <AuthProvider>{children}</AuthProvider>
    </LanguageProvider>
  );
}

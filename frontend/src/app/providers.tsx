'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth';

function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  return <AuthProvider>{children}</AuthProvider>;
}

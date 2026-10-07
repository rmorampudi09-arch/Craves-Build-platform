import { useEffect, useRef, useState } from 'react';
import './LandingNotice.css';

type AuthEntry = { openLandingAuth: () => Promise<void> };
let loaded: Promise<AuthEntry> | null = null;
let attemptedScript = '', failedImports = 0;

function loadCustomerAuth(): Promise<AuthEntry> {
  if (loaded) return loaded;
  loaded = (async () => {
    const response = await fetch('/landing-auth/manifest.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Sign-in is temporarily unavailable.');
    const assets = await response.json() as { script?: string; style?: string };
    if (!/^\/landing-auth\/auth-[\w-]+\.js$/.test(assets.script ?? '') || !/^\/landing-auth\/auth-[\w-]+\.css$/.test(assets.style ?? '')) throw new Error('Sign-in could not be loaded.');
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${assets.style}"]`);
    const style = existing ?? document.createElement('link');
    style.rel = 'stylesheet'; style.href = assets.style!;
    const cssReady = style.sheet ? Promise.resolve() : new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => { resolve(); }, 1200);
      style.onload = () => { clearTimeout(timer); resolve(); };
      style.onerror = () => { clearTimeout(timer); style.remove(); resolve(); };
    });
    if (!existing) document.head.append(style);
    if (attemptedScript !== assets.script) { attemptedScript = assets.script!; failedImports = 0; }
    const scriptUrl = assets.script + (failedImports ? `?craves_retry=${failedImports}` : '');
    // Browsers remember failed module URLs; only failures need a fresh retry URL.
    const entry = (import(/* @vite-ignore */ scriptUrl) as Promise<AuthEntry>).catch((error) => {
      failedImports += 1;
      throw error;
    });
    const [module] = await Promise.all([entry, cssReady]);
    if (typeof module.openLandingAuth !== 'function') throw new Error('Sign-in could not be loaded.');
    return module;
  })().catch((error) => { loaded = null; throw error; });
  return loaded;
}

export default function CustomerAuth() {
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // Production's capture adapter owns the same intent and click events.
    if (document.getElementById('craves-landing-auth-bridge')) return;
    const prewarm = (event: PointerEvent | FocusEvent) => {
      if (event.defaultPrevented || ('ctrlKey' in event &&
          (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
           (event.type === 'pointerdown' && event.button !== 0)))) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href="#sign-in"]') : null;
      if (anchor) void loadCustomerAuth().catch(() => {});
    };
    const open = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href="#sign-in"]') : null;
      if (!anchor) return;
      event.preventDefault();
      if (anchor.getAttribute('aria-busy') === 'true') return;
      anchor.setAttribute('aria-busy', 'true');
      const label = anchor.textContent;
      anchor.textContent = 'Opening…';
      void loadCustomerAuth().then((entry) => entry.openLandingAuth()).catch((reason) => {
        console.warn('Craves landing auth failed', reason);
        setError('We couldn’t open sign-in. Please check your connection and try again.');
      }).finally(() => {
        anchor.removeAttribute('aria-busy'); anchor.textContent = label;
      });
    };
    document.addEventListener('pointerover', prewarm, { passive: true });
    document.addEventListener('focusin', prewarm);
    document.addEventListener('pointerdown', prewarm, { passive: true });
    document.addEventListener('click', open);
    return () => {
      document.removeEventListener('pointerover', prewarm);
      document.removeEventListener('focusin', prewarm);
      document.removeEventListener('pointerdown', prewarm);
      document.removeEventListener('click', open);
    };
  }, []);
  useEffect(() => { if (error) dialog.current?.showModal(); }, [error]);
  return <dialog ref={dialog} className="landing-notice" aria-labelledby="auth-load-title" onClose={() => setError('')}>
    <button className="landing-notice__close" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
    <h2 id="auth-load-title">Please try again</h2><p role="alert">{error}</p>
    <button className="btn btn--primary" onClick={() => dialog.current?.close()}>Close</button>
  </dialog>;
}

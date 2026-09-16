import { useEffect, useRef, useState } from 'react';
import './LandingNotice.css';

type AuthEntry = { openLandingAuth: () => Promise<void> };
let loaded: Promise<AuthEntry> | null = null;

function loadCustomerAuth(): Promise<AuthEntry> {
  if (loaded) return loaded;
  loaded = (async () => {
    const response = await fetch('/landing-auth/manifest.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Sign-in is temporarily unavailable.');
    const assets = await response.json() as { script?: string; style?: string };
    if (!/^\/landing-auth\/auth-[\w-]+\.js$/.test(assets.script ?? '') || !/^\/landing-auth\/auth-[\w-]+\.css$/.test(assets.style ?? '')) throw new Error('Sign-in could not be loaded.');
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = assets.style!;
    const cssReady = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { style.remove(); reject(new Error('Sign-in took too long to load.')); }, 15000);
      style.onload = () => { clearTimeout(timer); resolve(); };
      style.onerror = () => { clearTimeout(timer); style.remove(); reject(new Error('Sign-in could not be loaded.')); };
    });
    document.head.append(style);
    const [module] = await Promise.all([import(/* @vite-ignore */ assets.script!) as Promise<AuthEntry>, cssReady]);
    if (typeof module.openLandingAuth !== 'function') throw new Error('Sign-in could not be loaded.');
    return module;
  })().catch((error) => { loaded = null; throw error; });
  return loaded;
}

export default function CustomerAuth() {
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href="#sign-in"]') : null;
      if (!anchor) return;
      event.preventDefault();
      if (anchor.getAttribute('aria-busy') === 'true') return;
      anchor.setAttribute('aria-busy', 'true');
      const label = anchor.textContent;
      anchor.textContent = 'Opening…';
      void loadCustomerAuth().then((entry) => entry.openLandingAuth()).catch(() => setError('We couldn’t open sign-in. Please check your connection and try again.')).finally(() => {
        anchor.removeAttribute('aria-busy'); anchor.textContent = label;
      });
    };
    document.addEventListener('click', open);
    return () => document.removeEventListener('click', open);
  }, []);
  useEffect(() => { if (error) dialog.current?.showModal(); }, [error]);
  return <dialog ref={dialog} className="landing-notice" aria-labelledby="auth-load-title" onClose={() => setError('')}>
    <button className="landing-notice__close" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
    <h2 id="auth-load-title">Please try again</h2><p role="alert">{error}</p>
    <button className="btn btn--primary" onClick={() => dialog.current?.close()}>Close</button>
  </dialog>;
}

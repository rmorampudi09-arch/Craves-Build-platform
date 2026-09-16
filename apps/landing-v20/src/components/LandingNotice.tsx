import { useEffect, useRef, useState } from 'react';
import './LandingNotice.css';

type Notice = { title: string; text: string; href: string; action: string };

function noticeFor(hash: string, channel?: string): Notice | null {
  if (hash === '#get-app') return {
    title: 'Craves, wherever you are',
    text: 'Our App Store and Google Play releases are coming soon. You can discover homemade meals and order on the Craves website today.',
    href: '/sign-in?returnTo=%2Fhome', action: 'Continue on the web',
  };
  if (hash === '#social') return {
    title: channel ? `Craves on ${channel}` : 'Stay connected with Craves',
    text: 'We will share our official social links here when they are available. You can reach the Craves team through our contact page.',
    href: '/contact', action: 'Contact Craves',
  };
  if (hash === '#chef-guidelines') return {
    title: 'Start your home-chef journey',
    text: 'The chef application lists the details and documents needed to get started. Contact our team for guidance on your kitchen, packaging and onboarding.',
    href: '/chef/application', action: 'Open chef application',
  };
  return null;
}

export default function LandingNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState<Notice | null>(() => noticeFor(window.location.hash));

  useEffect(() => {
    const openNotice = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      if (!anchor) return;
      const next = noticeFor(anchor.hash, anchor.dataset.channel);
      if (next) { event.preventDefault(); setNotice(next); }
    };
    document.addEventListener('click', openNotice);
    return () => document.removeEventListener('click', openNotice);
  }, []);

  useEffect(() => {
    if (!notice || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previousOverflow; };
  }, [notice]);

  return <dialog ref={dialog} className="landing-notice" aria-labelledby="landing-notice-title"
    aria-describedby="landing-notice-description" onClose={() => setNotice(null)}>
    <button type="button" className="landing-notice__close" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
    <h2 id="landing-notice-title">{notice?.title}</h2>
    <p id="landing-notice-description">{notice?.text}</p>
    <a className="btn btn--primary" href={notice?.href}>{notice?.action}</a>
  </dialog>;
}

'use client';

import { useEffect, useState } from 'react';
import type { AdminSessionView } from '@/lib/admin-session-contract';

const modules = [
  { title: 'Chef applications', description: 'Review pending chef applications and proof status.', state: 'Prepared as a separate module' },
  { title: 'Orders and refunds', description: 'Inspect order and refund workflows without bypassing service ownership.', state: 'Prepared as separate modules' },
  { title: 'Subscriptions', description: 'Review chef subscription state and plans from Subscription Service.', state: 'Prepared as a separate module' },
  { title: 'Support enquiries', description: 'Triage customer and chef support/contact requests.', state: 'Prepared as a separate module' },
  { title: 'Audit and health', description: 'Read administrative audit records and service readiness.', state: 'Prepared as separate modules' }
];

export function AdminOperationsShell() {
  const [identity, setIdentity] = useState<AdminSessionView | null>(null);
  const [message, setMessage] = useState('Checking administrator access…');

  useEffect(() => {
    let active = true;
    fetch('/api/admin/me', { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) {
          if (response.status === 401) throw new Error('Sign in with an administrator account.');
          if (response.status === 403) throw new Error('This identity does not have the ADMIN role.');
          throw new Error('Administrator access is temporarily unavailable.');
        }
        setIdentity(body as AdminSessionView);
        setMessage('');
      })
      .catch(error => active && setMessage(error instanceof Error ? error.message : 'Administrator access is unavailable.'));
    return () => { active = false; };
  }, []);

  if (!identity) {
    return <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950"><p role="status">{message}</p></section>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950 sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">ADMIN OPERATIONS</p>
        <h2 className="mt-3 text-3xl font-bold">Welcome{identity.displayName ? `, ${identity.displayName}` : ''}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">This shell only verifies the backend ADMIN role. Every operational action remains owned and authorized by its backend service.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {modules.map(module => (
          <article key={module.title} className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-white">
            <h3 className="text-xl font-bold">{module.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{module.description}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#F6B545]">{module.state}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

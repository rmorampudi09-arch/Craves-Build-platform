"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { ArrowLeft, BookOpen, GraduationCap, LayoutDashboard, LockKeyhole, Menu, Search, ShieldCheck, Truck, X } from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import type { AdminIdentity } from "@/lib/admin-contract";
import { AcademySkeleton } from "@/app/admin/academy/academy-ui";
import "@/app/admin/academy/academy.css";

/** Scoped to Academy: other administrative workspaces retain their existing theme. */
export function AcademyWorkspace({ identity, message, children }: { identity: AdminIdentity | null; message: string; children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => { drawer.current?.close(); menuButton.current?.focus(); };
  const nav = <>
    <div className="ca-shell-brand"><CravesLogo size="md" priority /><div><strong>CRAVES</strong><span>INTERNAL ACADEMY</span></div></div>
    <nav className="ca-shell-nav" aria-label="Craves workspaces">
      <span>WORKSPACE</span>
      <Link href="/admin" onClick={close}><LayoutDashboard size={18} />Administration</Link>
      <Link href="/admin/academy" aria-current="page" onClick={close}><GraduationCap size={18} />Craves Academy<ArrowLeft size={14} className="ca-nav-current" /></Link>
      <Link href="/delivery-intelligence" onClick={close}><Truck size={18} />Delivery Intelligence</Link>
      <span>EXPLORE</span>
      <Link href="/admin/search" onClick={close}><Search size={18} />Admin search</Link>
      <a href="#ca-content" onClick={close}><BookOpen size={18} />Learning workspace</a>
    </nav>
    <div className="ca-shell-safety"><ShieldCheck size={20} /><div><strong>Learn. Never change live data.</strong><span>Source and practice only</span></div></div>
  </>;
  const verifying = !identity && message.startsWith("Verifying");
  return <div className="ca-root ca-shell">
    <a className="ca-skip" href="#ca-main">Skip to learning workspace</a>
    <aside className="ca-shell-sidebar">{nav}</aside>
    <dialog ref={drawer} className="ca-shell-drawer" aria-label="Craves navigation" onClick={e => { if (e.target === drawer.current) close(); }}>
      <div className="ca-shell-drawer-inner"><button className="ca-shell-close" onClick={close} aria-label="Close navigation"><X size={20} /></button>{nav}</div>
    </dialog>
    <div className="ca-shell-main">
      <header className="ca-shell-header">
        <button ref={menuButton} className="ca-shell-menu ca-secondary" aria-label="Open navigation" onClick={() => drawer.current?.showModal()}><Menu size={20} /></button>
        <div className="ca-shell-page"><h1>Craves Academy</h1><p>Your product knowledge, connected.</p></div>
        <div className="ca-shell-private"><LockKeyhole size={14} /><span>Private workspace</span></div>
        <div className="ca-shell-account"><span className="ca-shell-avatar"><ShieldCheck size={18} /></span><div><strong>{identity?.displayName || "Administrator"}</strong><small>{identity ? "Role verified" : "Checking access"}</small></div></div>
      </header>
      <main id="ca-main" className="ca-shell-content" tabIndex={-1}>
        {identity ? children : verifying ? <AcademySkeleton /> : <section className="ca-error-state"><span className="ca-state-icon"><LockKeyhole size={32} /></span><div><span className="ca-kicker">ADMINISTRATOR ACCESS</span><h2>Continue securely to Academy</h2><p role="alert">{message || "Sign in with an authorized Craves administrator account."}</p><Link className="ca-primary" href="/sign-in?returnTo=%2Fadmin%2Facademy">Administrator sign in</Link></div></section>}
      </main>
    </div>
  </div>;
}

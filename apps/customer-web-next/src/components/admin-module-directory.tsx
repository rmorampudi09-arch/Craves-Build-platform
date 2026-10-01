"use client";

import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { searchAdminModules } from "@/lib/admin-navigation";
import { AdminModuleLink } from "@/components/admin-module-link";
import Link from "next/link";

const QUICK_TASKS = ["chefs", "finance", "operations", "plans", "accounts", "notifications"];

export function AdminModuleDirectory({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const modules = searchAdminModules(query).filter(module => module.id !== "overview" && module.id !== "modules" && (!compact || query.trim() || QUICK_TASKS.includes(module.id)));
  return <section className="cr-panel" aria-labelledby="cr-directory-title">
    <div className="cr-section-heading">
      <div><p className="cr-eyebrow">Your admin workspace</p><h2 id="cr-directory-title">{compact ? "Quick tasks" : "All modules & controls"}</h2><p className="cr-muted">{compact ? "Open a daily task or search for another module." : "Choose the task you need to complete."}</p></div>
      <label className="cr-search-field"><Search size={17} aria-hidden="true"/><span className="cr-sr-only">Find a module</span><input type="search" placeholder="Find a module or task…" value={query} onChange={event => setQuery(event.target.value)} maxLength={100}/></label>
    </div>
    <div className="cr-module-grid">
      {modules.map(module => <AdminModuleLink key={module.id} module={module} className="cr-module-card">
        {!compact && <span className="cr-eyebrow">{module.group}</span>}<strong>{module.label}<ArrowRight size={17} aria-hidden="true"/></strong><span className="cr-muted">{module.description}</span>{!compact && <span className="cr-access-label">{module.access}</span>}
      </AdminModuleLink>)}
    </div>
    {modules.length === 0 && <div className="cr-empty" role="status"><strong>No matching modules</strong><p>Try “orders”, “finance”, “chef” or “recovery”.</p><button className="cr-button" onClick={() => setQuery("")}>Clear search</button></div>}
    {compact && <Link className="cr-button cr-directory-more" href="/admin/modules">View all modules<ArrowRight size={16} aria-hidden="true"/></Link>}
  </section>;
}

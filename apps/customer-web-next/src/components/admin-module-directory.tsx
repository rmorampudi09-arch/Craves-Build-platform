"use client";

import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { searchAdminModules } from "@/lib/admin-navigation";
import { AdminModuleLink } from "@/components/admin-module-link";

export function AdminModuleDirectory({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const modules = searchAdminModules(query).filter(module => module.id !== "overview" && module.id !== "modules");
  return <section className="cr-panel" aria-labelledby="cr-directory-title">
    <div className="cr-section-heading">
      <div><p className="cr-eyebrow">Your admin workspace</p><h2 id="cr-directory-title">{compact ? "Everything in one place" : "All modules & controls"}</h2><p className="cr-muted">Choose a task. Each workspace keeps its own permission and approval checks.</p></div>
      <label className="cr-search-field"><Search size={17} aria-hidden="true"/><span className="cr-sr-only">Find a module</span><input type="search" placeholder="Find a module or task…" value={query} onChange={event => setQuery(event.target.value)} maxLength={100}/></label>
    </div>
    <div className="cr-module-grid">
      {modules.map(module => <AdminModuleLink key={module.id} module={module} className="cr-module-card">
        <span className="cr-eyebrow">{module.group}</span><strong>{module.label}<ArrowRight size={17} aria-hidden="true"/></strong><span className="cr-muted">{module.description}</span><span className="cr-access-label">{module.access}</span>
      </AdminModuleLink>)}
    </div>
    {modules.length === 0 && <div className="cr-empty" role="status"><strong>No matching modules</strong><p>Try “orders”, “finance”, “chef” or “recovery”.</p><button className="cr-button" onClick={() => setQuery("")}>Clear search</button></div>}
    <p className="cr-footnote">A listed module is not a service-health or production-activation guarantee. Missing permissions or disabled capabilities are reported by the owning service.</p>
  </section>;
}

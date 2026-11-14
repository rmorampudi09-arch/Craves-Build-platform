"use client";

import Link from "next/link";
import { useState } from "react";
import { ADMIN_MODULES, newAdminPlace } from "@/features/admin/shell/lib/admin-navigation";

/** All tools: every tool from the old admin menu by its old name, and where it is now. Typing filters by old or new name. */
export function AdminModuleDirectory() {
  const [query, setQuery] = useState("");
  const rows = ADMIN_MODULES.map(module => ({ module, place: newAdminPlace(module) }));
  const words = query.trim().toLocaleLowerCase("en-IN").split(/\s+/).filter(Boolean);
  const shown = rows.filter(({ module, place }) => words.every(word => `${module.label} ${place.label} ${module.keywords}`.toLocaleLowerCase("en-IN").includes(word)));
  return <section aria-labelledby="ad-tools-title">
    <h2 id="ad-tools-title" className="cr-sr-only">Old menu names</h2>
    <div className="ad-field"><label htmlFor="ad-tools-q">Type an old or new name</label>
      <input id="ad-tools-q" className="ad-input" type="search" placeholder="For example: dead letters, payouts, banner" value={query} maxLength={100} onChange={event => setQuery(event.target.value)}/></div>
    <p className="cr-sr-only" role="status">{words.length ? `${shown.length} ${shown.length === 1 ? "tool" : "tools"} found` : ""}</p>
    {shown.length ? <div className="cr-table-scroll" tabIndex={0}><table className="ad-table">
      <thead><tr><th scope="col">Old name</th><th scope="col">Where it is now</th></tr></thead>
      <tbody>{shown.map(({ module, place }) => <tr key={module.id}><td><b>{module.label}</b></td>
        <td>{module.externalApp ? <a href={place.href}>{place.label}</a> : <Link href={place.href} prefetch={false}>{place.label}</Link>}</td></tr>)}</tbody>
    </table></div>
      : <div className="ad-empty" role="status"><b>No tool matches.</b><span>Try one word, like “payout” or “rider”, or press Ctrl K to search everything.</span></div>}
  </section>;
}

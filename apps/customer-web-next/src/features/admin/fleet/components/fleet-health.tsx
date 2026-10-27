"use client";

import { useCallback, useEffect, useState } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { pilotHealthSchema, type PilotHealth } from "@/features/admin/fleet/lib/health-contract";

type Cell = PilotHealth["results"][number]["rows"][number][number];

/** Times in IST like the rest of the console; days, numbers and text as the database sent them. */
function cellText(cell: Cell): string {
  if (cell === null) return "—";
  if (typeof cell === "boolean") return cell ? "Yes" : "No";
  return typeof cell === "string" && /^\d{4}-\d{2}-\d{2}T/.test(cell) ? formatAdminTimestamp(cell) : String(cell);
}

/** The pilot's health and trigger queries (docs/riders/PILOT-HEALTH.md), run read-only by the server on each load. */
export function FleetHealth() {
  const [report, setReport] = useState<PilotHealth | null>(null);
  const [message, setMessage] = useState("Running the health queries…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setReport(await fleetGet("pilot-health", pilotHealthSchema));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pilot health is unavailable.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!report) return <p className="cr-panel" role="status">{message}</p>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="cr-button" disabled={busy} onClick={() => void load()}>{busy ? "Running…" : "Run again"}</button>
      <span className="cr-muted">Run {formatAdminTimestamp(report.generatedAt)}</span>
    </div>
    {message && <p className="cr-alert" role="alert">{message}</p>}
    {report.results.map(result => <section key={result.name} className="cr-panel space-y-3" aria-labelledby={`health-${result.name}`}>
      <h2 id={`health-${result.name}`} className="text-lg font-bold">{readableFleetValue(result.name)}</h2>
      {result.description && <p className="cr-muted">{result.description}</p>}
      {result.error ? <p className="cr-alert" role="alert">{result.error}</p>
        : result.rows.length === 0 ? <p className="cr-empty">No rows yet.</p>
        : <div className="cr-table-scroll"><table className="cr-table">
          <thead><tr>{result.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{result.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cellText(cell)}</td>)}</tr>)}</tbody>
        </table></div>}
      {result.truncated && <p className="cr-muted">Showing the first {result.rows.length} rows. Run the query with psql for the rest.</p>}
    </section>)}
  </div>;
}

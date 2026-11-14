"use client";

import { useState, type KeyboardEvent } from "react";
import { compactRupees, dayLabel, fromPaise, niceCeiling, rupees, type Bucket } from "@/features/admin/finance/lib/insights-contract";

const PLOT = 232;
const money = (value: bigint) => rupees(fromPaise(value));
const out = (bucket: Bucket) => bucket.refunded + bucket.chefPaid + bucket.riderPaid;
const period = (bucket: Bucket) => bucket.from === bucket.to ? dayLabel(bucket.from) : `${dayLabel(bucket.from)} to ${dayLabel(bucket.to)}`;

/**
 * Money in rises from the line and money out hangs below it, on one scale. Which is which is carried by position as well as
 * colour (flame red in, espresso out), so it never rests on colour alone. Each bar opens that period's transactions.
 */
export function FlowChart({ buckets, onPick }: { buckets: Bucket[]; onPick: (from: string, to: string) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const topIn = niceCeiling(buckets.reduce((max, bucket) => bucket.moneyIn > max ? bucket.moneyIn : max, 0n));
  const topOut = niceCeiling(buckets.reduce((max, bucket) => out(bucket) > max ? out(bucket) : max, 0n));
  if (topIn + topOut === 0n) return <div className="fn-empty"><strong>No money moved in this period</strong>
    <p className="fn-note">Customer payments, refunds and payouts are drawn here day by day. Try a longer period.</p></div>;
  const inHeight = Math.round(PLOT * Number(topIn * 1000n / (topIn + topOut)) / 1000);
  const height = (value: bigint, top: bigint, side: number) => top === 0n ? 0 : Math.max(value > 0n ? 2 : 0, side * Number(value * 10000n / top) / 10000);
  const rules = [
    { at: 0, label: compactRupees(topIn), show: topIn > 0n }, { at: inHeight / 2, label: compactRupees(topIn / 2n), show: inHeight >= 90 },
    { at: inHeight, label: "₹0", show: true, zero: true },
    { at: inHeight + (PLOT - inHeight) / 2, label: compactRupees(topOut / 2n), show: PLOT - inHeight >= 90 }, { at: PLOT, label: compactRupees(topOut), show: topOut > 0n },
  ].filter(rule => rule.show);
  const every = Math.ceil(buckets.length / 8);
  const shown = active === null ? null : buckets[active];
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : -1;
    if (next < 0 || next >= buckets.length) return;
    event.preventDefault();
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }
  return <>
    <div className="fn-flow" onMouseLeave={() => setActive(null)}>
      <div className="fn-axis" style={{ height: PLOT }} aria-hidden="true">{rules.map(rule => <span key={rule.at} style={{ top: rule.at }}>{rule.label}</span>)}</div>
      <div className="fn-plot">
        <div style={{ minWidth: buckets.length * 9 }}>
          <div className="fn-plot-inner" style={{ height: PLOT }} role="group" aria-label="Money in and out for each period. Use the left and right arrow keys to move; Enter opens that period's transactions.">
            {rules.map(rule => <span key={rule.at} className="fn-rule" data-zero={rule.zero ? "true" : undefined} style={{ top: rule.at }} />)}
            {buckets.map((bucket, index) => <button key={bucket.from} type="button" className="fn-col" data-active={active === index ? "true" : undefined}
              tabIndex={index === (active ?? 0) ? 0 : -1} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}
              onKeyDown={event => move(event, index)} onClick={() => onPick(bucket.from, bucket.to)}
              aria-label={`${period(bucket)}: ${money(bucket.moneyIn)} in, ${money(out(bucket))} out. Open transactions.`}>
              <span className="fn-bar" data-series="in" style={{ top: inHeight - height(bucket.moneyIn, topIn, inHeight), height: height(bucket.moneyIn, topIn, inHeight) }} />
              <span className="fn-bar" data-series="out" style={{ top: inHeight + 1, height: height(out(bucket), topOut, PLOT - inHeight) }} />
            </button>)}
          </div>
          <div className="fn-ticks" aria-hidden="true">{buckets.map((bucket, index) => <span key={bucket.from} data-minor={index % (every * 2) === 0 ? undefined : "true"}>{index % every === 0 ? bucket.label : ""}</span>)}</div>
        </div>
      </div>
      {shown && active !== null && <div className="fn-tip" role="status" style={active < buckets.length / 2
        ? { left: `calc(62px + (100% - 62px) * ${(active + 1) / buckets.length} + 8px)` } : { right: `calc((100% - 62px) * ${(buckets.length - active) / buckets.length} + 8px)` }}>
        <strong>{period(shown)}</strong>
        <div>Customers paid <b>{money(shown.moneyIn)}</b></div>
        <div>Refunded <b>{money(shown.refunded)}</b></div>
        <div>Paid to chefs <b>{money(shown.chefPaid)}</b></div>
        <div>Paid to riders <b>{money(shown.riderPaid)}</b></div>
      </div>}
    </div>
    <details className="fn-tabletoggle"><summary>Show these figures as a table</summary>
      <div className="cr-table-scroll" tabIndex={0}><table className="fn-table"><thead><tr><th scope="col">Period</th><th scope="col" className="fn-amount">Customers paid</th>
        <th scope="col" className="fn-amount">Refunded</th><th scope="col" className="fn-amount">Paid to chefs</th><th scope="col" className="fn-amount">Paid to riders</th></tr></thead>
        <tbody>{buckets.map(bucket => <tr key={bucket.from} onClick={() => onPick(bucket.from, bucket.to)}><td>{period(bucket)}</td>
          {[bucket.moneyIn, bucket.refunded, bucket.chefPaid, bucket.riderPaid].map((value, index) => <td key={index} className="fn-amount fn-num">{money(value)}</td>)}</tr>)}</tbody></table></div>
    </details>
  </>;
}

export type Share = { name: string; hint: string; amount: string; own?: boolean };
/** One bar per share on a common start, so close amounts can be compared; the amount and its share are printed beside it. */
export function ShareBars({ shares, whole }: { shares: Share[]; whole: bigint }) {
  return <div className="fn-shares">{shares.map(share => {
    const part = BigInt(share.amount.replace(".", "")), size = part < 0n ? -part : part;
    // Rounded to the nearest tenth, not cut off: cut off, 50.87% read 50.8% and the shares of one total added up to 99.8%.
    const tenths = whole > 0n ? Number((size * 2000n + whole) / (2n * whole)) * (part < 0n ? -1 : 1) : 0;
    return <div className="fn-share" key={share.name} data-own={share.own ? "true" : undefined}>
      <span><strong>{share.name}</strong><small>{share.hint}</small></span>
      <span className="fn-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, tenths / 10))}%` }} /></span>
      <span><span className="fn-num">{rupees(share.amount)}</span><small className="fn-num">{(tenths / 10).toFixed(1)}%</small></span>
    </div>;
  })}</div>;
}

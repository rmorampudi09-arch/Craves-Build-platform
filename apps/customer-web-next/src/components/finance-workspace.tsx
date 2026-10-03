"use client";

import { useState } from "react";
import { BankAutomationAdminPanel } from "@/components/bank-automation-admin-panel";
import { ChefTaxProfilePanel } from "@/components/chef-tax-profile-panel";
import { FinanceControlCenter } from "@/components/finance-control-center";
import { FinanceReconciliationPanel } from "@/components/finance-reconciliation-panel";
import { ManualChefSettlementPanel } from "@/components/manual-chef-settlement-panel";

const tabs = [
  {id: "payments", label: "Chef payments", description: "Review earnings, record manual payments and manage holds."},
  {id: "policy", label: "Policy & rates", description: "Review current rates, save a policy draft and activate an approved version."},
  {id: "tax", label: "Chef tax profiles", description: "Review a chef’s declarations, accepted fee terms and ledger source evidence."},
  {id: "preview", label: "Price preview", description: "Calculate a subscription price including taxes before checkout."},
  {id: "bank", label: "Bank & RazorpayX", description: "Review provider readiness and existing bank records. Vendor activation is pending."},
] as const;
type FinanceTab = typeof tabs[number]["id"];

export function FinanceWorkspace() {
  const [active, setActive] = useState<FinanceTab>("payments");
  return <div className="finance-workspace">
    <header className="finance-workspace-header"><div><p className="finance-eyebrow">Craves admin</p><h1>Finance</h1><p>One workspace for chef earnings, payments and approved finance settings.</p></div><span className="finance-vendor-pending">RazorpayX disabled · vendor approval pending</span></header>
    <div className="finance-tabs" role="tablist" aria-label="Finance tasks">{tabs.map(tab => <button key={tab.id} type="button" id={`finance-tab-${tab.id}`} role="tab" aria-selected={active === tab.id} aria-controls="finance-task-panel" tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={event => {
      const index = tabs.findIndex(item => item.id === active);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next !== null) {event.preventDefault();setActive(tabs[next].id);document.getElementById(`finance-tab-${tabs[next].id}`)?.focus();}
    }}>{tab.label}</button>)}</div>
    <p className="finance-task-description">{tabs.find(tab => tab.id === active)?.description}</p>
    <div id="finance-task-panel" role="tabpanel" aria-labelledby={`finance-tab-${active}`}>
      <div hidden={active !== "payments"}><ManualChefSettlementPanel /></div>
      <div hidden={active !== "payments" && active !== "policy" && active !== "preview"}><FinanceControlCenter section={active === "payments" || active === "preview" ? active : "policy"} /></div>
      <div hidden={active !== "tax"}><ChefTaxProfilePanel /></div>
      <div hidden={active !== "bank"}><BankAutomationAdminPanel /><FinanceReconciliationPanel /></div>
    </div>
  </div>;
}

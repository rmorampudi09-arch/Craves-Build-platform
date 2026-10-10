"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Gauge,
  Info,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChefMenuItem } from "@/lib/chef-menu-contract";
import {
  parseChefCapacitySummary,
  type ChefCapacitySummary,
} from "@/lib/chef-subscription-capacity-contract";
import type {
  ChefMealPlan,
  ChefMealPlanPeriod,
  ChefMealSchedule,
} from "@/lib/chef-subscription-plan-contract";

type PlanForm = {
  name: string;
  description: string;
  billingPeriod: ChefMealPlanPeriod;
  amount: string;
};

type MealRow = {
  day: string;
  mealSlotCode: string;
  serviceTime: string;
  menuItemId: string;
  quantity: string;
};

type MessageTone = "info" | "success" | "error";

const EMPTY_FORM: PlanForm = {
  name: "",
  description: "",
  billingPeriod: "WEEKLY",
  amount: "",
};

const SLOT_DEFAULT_TIME: Record<string, string> = {
  BREAKFAST: "08:30",
  LUNCH: "12:30",
  DINNER: "19:30",
  SNACK: "16:30",
};

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const MEAL_SLOTS = [
  ["BREAKFAST", "Breakfast"],
  ["LUNCH", "Lunch"],
  ["SNACK", "Snack"],
  ["DINNER", "Dinner"],
] as const;

function emptyMeal(): MealRow {
  return {
    day: "1",
    mealSlotCode: "LUNCH",
    serviceTime: "12:30",
    menuItemId: "",
    quantity: "1",
  };
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusMeta(status: ChefMealPlan["status"]) {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Live for customers",
        icon: CheckCircle2,
        className: "border-[#BBE8D0] bg-[#EAF8F0] text-[#15803D]",
      };
    case "PENDING_APPROVAL":
      return {
        label: "Waiting for review",
        icon: Clock3,
        className: "border-[#F3D7A1] bg-[#FFF7E6] text-[#92400E]",
      };
    case "REJECTED":
      return {
        label: "Changes requested",
        icon: AlertTriangle,
        className: "border-[#F6C6C3] bg-[#FFF0EF] text-[#B91C1C]",
      };
    case "INACTIVE":
      return {
        label: "Inactive",
        icon: LockKeyhole,
        className: "border-[#D8DEE3] bg-[#F1F3F5] text-[#4B5563]",
      };
    default:
      return {
        label: "Draft",
        icon: FileText,
        className: "border-[#D8DEE3] bg-[#F1F3F5] text-[#4B5563]",
      };
  }
}

function statusDescription(status: ChefMealPlan["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "Approved and currently available to customers.";
    case "PENDING_APPROVAL":
      return "Your plan is locked while Craves reviews it.";
    case "REJECTED":
      return "Review the Admin note, make the requested changes, then resubmit.";
    case "INACTIVE":
      return "This plan is not currently available to customers.";
    default:
      return "Keep editing until the plan is ready to submit.";
  }
}

function rowsFromSchedule(schedule: ChefMealSchedule): MealRow[] {
  return schedule.items.map((item) => ({
    day: String(
      schedule.recurrenceType === "WEEKLY"
        ? item.isoDayOfWeek
        : item.dayOfMonth,
    ),
    mealSlotCode: item.mealSlotCode,
    serviceTime: item.serviceTime.slice(0, 5),
    menuItemId: item.menuItemId,
    quantity: String(item.quantity),
  }));
}

function dayLabel(value: string, period: ChefMealPlanPeriod): string {
  const day = Number(value);
  if (period === "WEEKLY") return WEEKDAYS[day - 1] ?? "Day";
  return `Day ${day}`;
}

function StatusPill({ status }: { status: ChefMealPlan["status"] }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function StepIndicator({ current }: { current: number }) {
  const steps = [
    ["1", "Plan details"],
    ["2", "Meal schedule"],
    ["3", "Review & submit"],
  ];

  return (
    <ol
      aria-label="Meal plan setup steps"
      className="grid gap-2 sm:grid-cols-3"
    >
      {steps.map(([number, label], index) => {
        const step = index + 1;
        const complete = step < current;
        const active = step === current;
        return (
          <li
            key={number}
            className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 ${
              active
                ? "border-[var(--color-flame-red)] bg-[var(--color-flame-red)]/5"
                : complete
                  ? "border-[var(--color-flame-red)]/20 bg-[var(--color-flame-red)]/5"
                  : "border-[#E5E7EB] bg-[#F8F9FA]"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                active || complete
                  ? "bg-[var(--color-flame-red)] text-white"
                  : "bg-[#E5E7EB] text-[#6B6B6B]"
              }`}
            >
              {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : number}
            </span>
            <span
              className={`text-sm font-semibold ${
                active ? "text-[#1A1A1A]" : "text-[#6B6B6B]"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ChefSubscriptionPlanManager() {
  const [plans, setPlans] = useState<ChefMealPlan[]>([]);
  const [menu, setMenu] = useState<ChefMenuItem[]>([]);
  const [kitchenRequired, setKitchenRequired] = useState(false);
  const [capacity, setCapacity] = useState<ChefCapacitySummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [showNew, setShowNew] = useState(false);
  const [rows, setRows] = useState<MealRow[]>([emptyMeal()]);
  const [leadHours, setLeadHours] = useState("24");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState(
    "Loading your meal-plan workspace…",
  );
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [capacityDay, setCapacityDay] = useState("1");
  const [capacitySlot, setCapacitySlot] = useState("LUNCH");
  const [totalCapacity, setTotalCapacity] = useState("20");
  const [subscriptionCapacity, setSubscriptionCapacity] = useState("10");
  const [capacitySalesEnabled, setCapacitySalesEnabled] = useState(true);

  const availableMenu = useMemo(
    () => menu.filter((item) => item.status === "ACTIVE" && item.available),
    [menu],
  );

  const selected = useMemo(
    () => plans.find((plan) => plan.id === selectedId) ?? null,
    [plans, selectedId],
  );

  const editable =
    selected?.status === "DRAFT" || selected?.status === "REJECTED";

  const selectedScheduleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.menuItemId &&
          row.day &&
          row.mealSlotCode &&
          row.serviceTime &&
          row.quantity,
      ),
    [rows],
  );

  const matchingCapacityRules = useMemo(() => {
    if (!capacity) return [];
    return selectedScheduleRows
      .map((row) => {
        const day = Number(row.day);
        return capacity.slotRules.find(
          (rule) =>
            rule.isoDayOfWeek === day &&
            rule.mealSlotCode === row.mealSlotCode,
        );
      })
      .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));
  }, [capacity, selectedScheduleRows]);

  const readiness = useMemo(() => {
    const detailsReady =
      Boolean(form.name.trim()) &&
      Number.isFinite(Number(form.amount)) &&
      Number(form.amount) >= 0;

    const scheduleReady =
      selectedScheduleRows.length > 0 &&
      selectedScheduleRows.length === rows.length &&
      selectedScheduleRows.every((row) => {
        const day = Number(row.day);
        const validDay =
          selected?.billingPeriod === "MONTHLY"
            ? day >= 1 && day <= 28
            : day >= 1 && day <= 7;
        const validQuantity =
          Number.isInteger(Number(row.quantity)) &&
          Number(row.quantity) >= 1 &&
          Number(row.quantity) <= 100;
        return validDay && validQuantity;
      });

    const dishesReady =
      scheduleReady &&
      selectedScheduleRows.every((row) =>
        availableMenu.some((item) => item.id === row.menuItemId),
      );

    return {
      detailsReady,
      scheduleReady,
      dishesReady,
    };
  }, [availableMenu, form.amount, form.name, rows, selected, selectedScheduleRows]);

  const load = useCallback(async () => {
    const [plansResponse, menuResponse, capacityResponse] =
      await Promise.all([
        fetch("/api/chef/subscription-plans", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/chef/menu", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/chef/subscription-capacity", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

    if (plansResponse.status === 401 || menuResponse.status === 401) {
      throw new ChefError("Chef session expired. Sign in again.", "SESSION_EXPIRED", 401);
    }
    if (plansResponse.status === 403 || menuResponse.status === 403) {
      throw new ChefError("Approved CHEF access is required.", "CHEF_ACCESS_REQUIRED", 403);
    }
    if (!plansResponse.ok) {
      const body = await plansResponse.json().catch(() => null);
      throw chefApiError(plansResponse, body, "Your meal plans are temporarily unavailable.");
    }
    const menuBody: unknown = await menuResponse.json().catch(() => null);
    const missingKitchen =
      menuResponse.status === 400 &&
      menuBody !== null &&
      typeof menuBody === "object" &&
      !Array.isArray(menuBody) &&
      "code" in menuBody &&
      menuBody.code === "KITCHEN_PROFILE_REQUIRED";
    if (!menuResponse.ok && !missingKitchen) {
      throw chefApiError(menuResponse, menuBody, "Your available menu is temporarily unavailable.");
    }

    const planBody = await plansResponse.json();

    const nextPlans = Array.isArray(planBody)
      ? (planBody as ChefMealPlan[])
      : [];
    const nextMenu = Array.isArray(menuBody)
      ? (menuBody as ChefMenuItem[])
      : [];

    setPlans(nextPlans);
    setMenu(nextMenu);
    setKitchenRequired(missingKitchen);

    if (capacityResponse.ok) {
      const capacityBody = await capacityResponse.json().catch(() => null);
      const parsedCapacity = parseChefCapacitySummary(capacityBody);
      setCapacity(parsedCapacity);
    } else {
      setCapacity(null);
    }

    setSelectedId((current) =>
      current && nextPlans.some((plan) => plan.id === current)
        ? current
        : nextPlans[0]?.id ?? null,
    );
  }, []);

  const loadSchedule = useCallback(async (plan: ChefMealPlan) => {
    const response = await fetch(
      `/api/chef/subscription-plans/${plan.id}/schedule`,
      {
        cache: "no-store",
        credentials: "same-origin",
      },
    );

    if (response.status === 404) {
      setRows([emptyMeal()]);
      setLeadHours("24");
      return;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw chefApiError(response, body, "Meal schedule could not be loaded.");
    }

    const schedule = (await response.json()) as ChefMealSchedule;
    setRows(rowsFromSchedule(schedule));
    setLeadHours(String(schedule.generationLeadHours));
  }, []);

  useEffect(() => {
    void load()
      .then(() => {
        setMessage("");
      })
      .catch((error) => {
        setMessage(
          chefErrorText(error, "Meal plans are unavailable."),
        );
        setMessageTone("error");
      });
  }, [load]);

  useEffect(() => {
    if (!selected || showNew) return;

    setForm({
      name: selected.name,
      description: selected.description ?? "",
      billingPeriod: selected.billingPeriod,
      amount: String(selected.amount),
    });

    void loadSchedule(selected).catch((error) => {
      setMessage(
        chefErrorText(error, "Meal schedule is unavailable."),
      );
      setMessageTone("error");
    });
  }, [loadSchedule, selected, showNew]);

  useEffect(() => {
    if (!capacity) return;
    const rule = capacity.slotRules.find(
      (item) =>
        item.isoDayOfWeek === Number(capacityDay) &&
        item.mealSlotCode === capacitySlot,
    );
    if (rule) {
      setTotalCapacity(String(rule.totalCapacityUnits));
      setSubscriptionCapacity(String(rule.subscriptionCapacityUnits));
      setCapacitySalesEnabled(rule.salesEnabled);
    }
  }, [capacity, capacityDay, capacitySlot]);

  function setField<K extends keyof PlanForm>(
    field: K,
    value: PlanForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setInfoMessage(value: string) {
    setMessage(value);
    setMessageTone("info");
  }

  function setSuccessMessage(value: string) {
    setMessage(value);
    setMessageTone("success");
  }

  function setErrorMessage(value: string) {
    setMessage(value);
    setMessageTone("error");
  }

  function updateRow(index: number, field: keyof MealRow, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (field === "mealSlotCode") {
          return {
            ...row,
            mealSlotCode: value,
            serviceTime: SLOT_DEFAULT_TIME[value] ?? row.serviceTime,
          };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function validatePlanForm(): {
    name: string;
    description: string | null;
    billingPeriod: ChefMealPlanPeriod;
    amount: number;
    currency: string;
  } | null {
    const amount = Number(form.amount);

    if (!form.name.trim()) {
      setErrorMessage("Enter a name for the meal plan.");
      return null;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setErrorMessage("Enter a valid non-negative plan price.");
      return null;
    }

    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      billingPeriod: form.billingPeriod,
      amount,
      currency: "INR",
    };
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    const payload = validatePlanForm();
    if (!payload) return;

    setBusy(true);
    setInfoMessage("Creating your meal-plan draft…");

    try {
      const response = await fetch("/api/chef/subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw chefApiError(response, body, "Meal plan draft could not be created.");
      }

      const created = body as ChefMealPlan;
      setPlans((current) => [created, ...current]);
      setSelectedId(created.id);
      setRows([emptyMeal()]);
      setLeadHours("24");
      setNote("");
      setShowNew(false);
      setSuccessMessage(
        "Draft created. Now add the meals you want customers to receive.",
      );
    } catch (error) {
      setErrorMessage(
        chefErrorText(error, "Meal plan draft could not be created."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    if (!selected || !editable) return;

    const payload = validatePlanForm();
    if (!payload) return;

    setBusy(true);
    setInfoMessage("Saving plan details…");

    try {
      const response = await fetch(
        `/api/chef/subscription-plans/${selected.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw chefApiError(response, body, "Plan details could not be saved.");
      }

      const updated = body as ChefMealPlan;
      setPlans((current) =>
        current.map((plan) => (plan.id === updated.id ? updated : plan)),
      );
      setSuccessMessage("Plan details saved.");
    } catch (error) {
      setErrorMessage(
        chefErrorText(error, "Plan details could not be saved."),
      );
    } finally {
      setBusy(false);
    }
  }

  function schedulePayload(plan: ChefMealPlan) {
    const lead = Number(leadHours);

    if (!Number.isInteger(lead) || lead < 1 || lead > 168) {
      setErrorMessage(
        "Preparation lead time must be between 1 and 168 hours.",
      );
      return null;
    }

    if (rows.length < 1) {
      setErrorMessage("Add at least one meal before saving.");
      return null;
    }

    const items = rows.map((row, index) => {
      const day = Number(row.day);
      const quantity = Number(row.quantity);
      const validDay =
        plan.billingPeriod === "WEEKLY"
          ? Number.isInteger(day) && day >= 1 && day <= 7
          : Number.isInteger(day) && day >= 1 && day <= 28;
      const validQuantity =
        Number.isInteger(quantity) && quantity >= 1 && quantity <= 100;

      if (
        !row.menuItemId ||
        !validDay ||
        !validQuantity ||
        !/^\d{2}:\d{2}$/.test(row.serviceTime) ||
        !row.mealSlotCode
      ) {
        return null;
      }

      return {
        menuItemId: row.menuItemId,
        quantity,
        isoDayOfWeek: plan.billingPeriod === "WEEKLY" ? day : null,
        dayOfMonth: plan.billingPeriod === "MONTHLY" ? day : null,
        mealSlotCode: row.mealSlotCode,
        serviceTime: row.serviceTime,
        sequenceNumber: index + 1,
      };
    });

    if (items.some((item) => item === null)) {
      setErrorMessage(
        "Complete every meal row with a valid day, dish, quantity and service time.",
      );
      return null;
    }

    return {
      recurrenceType: plan.billingPeriod,
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"
          : "Asia/Kolkata",
      generationLeadHours: lead,
      items,
    };
  }

  async function saveSchedule(submitAfterSave: boolean) {
    if (!selected || !editable) return;

    const payload = schedulePayload(selected);
    if (!payload) return;

    setBusy(true);
    setInfoMessage(
      submitAfterSave
        ? "Saving the schedule and checking it for submission…"
        : "Saving your meal schedule…",
    );

    try {
      const save = await fetch(
        `/api/chef/subscription-plans/${selected.id}/schedule`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        },
      );
      const saveBody = await save.json().catch(() => null);

      if (!save.ok) {
        const failure = chefApiError(save, saveBody, "Meal schedule could not be saved.");
        throw save.status === 409 && !CHEF_ERROR_MESSAGES[failure.ref]
          ? new ChefError("One of the selected dishes is no longer active, available or owned by your kitchen.", failure.ref, 409)
          : failure;
      }

      const savedSchedule = saveBody as ChefMealSchedule;
      setRows(rowsFromSchedule(savedSchedule));

      if (!submitAfterSave) {
        setSuccessMessage(
          "Meal schedule saved as a draft. You can keep editing it.",
        );
        return;
      }

      const submit = await fetch(
        `/api/chef/subscription-plans/${selected.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ note: note.trim() || null }),
        },
      );
      const submitBody = await submit.json().catch(() => null);

      if (!submit.ok) {
        throw chefApiError(submit, submitBody, "The plan is not ready for approval yet. Check the schedule and selected dishes.");
      }

      const submitted = submitBody as ChefMealPlan;
      setPlans((current) =>
        current.map((plan) => (plan.id === submitted.id ? submitted : plan)),
      );
      setNote("");
      setSuccessMessage(
        "Submitted for Admin approval. Your plan is now locked while it is reviewed.",
      );
    } catch (error) {
      setErrorMessage(
        chefErrorText(error, "Meal plan could not be saved."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCapacity() {
    const day = Number(capacityDay);
    const total = Number(totalCapacity);
    const subscription = Number(subscriptionCapacity);

    if (!Number.isInteger(day) || day < 1 || day > 7) {
      setErrorMessage("Choose a valid weekday.");
      return;
    }

    if (
      !Number.isInteger(total) ||
      total < 0 ||
      !Number.isInteger(subscription) ||
      subscription < 0 ||
      subscription > total
    ) {
      setErrorMessage(
        "Subscription capacity must be a whole number and cannot exceed total kitchen capacity.",
      );
      return;
    }

    if (capacity?.adminSalesFrozen) {
      setErrorMessage(
        capacity.freezeReason
          ? `Subscription sales are currently frozen by Admin: ${capacity.freezeReason}`
          : "Subscription sales are currently frozen by Admin.",
      );
      return;
    }

    setBusy(true);
    setInfoMessage("Saving subscription capacity…");

    try {
      const response = await fetch(
        "/api/chef/subscription-capacity/rules/slots",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            isoDayOfWeek: day,
            mealSlotCode: capacitySlot,
            totalCapacityUnits: total,
            subscriptionCapacityUnits: subscription,
            salesEnabled: capacitySalesEnabled,
            reason: "Updated from Chef meal-plan workspace",
          }),
        },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw chefApiError(response, body, "Subscription capacity could not be saved.");
      }

      const refreshed = await fetch("/api/chef/subscription-capacity", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const refreshedBody = await refreshed.json().catch(() => null);
      const parsed = parseChefCapacitySummary(refreshedBody);
      if (refreshed.ok && parsed) setCapacity(parsed);

      setSuccessMessage(
        `${WEEKDAYS[day - 1]} ${capacitySlot.toLowerCase()} capacity saved.`,
      );
    } catch (error) {
      setErrorMessage(
        chefErrorText(error, "Subscription capacity could not be saved."),
      );
    } finally {
      setBusy(false);
    }
  }

  function beginNew() {
    setShowNew(true);
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setRows([emptyMeal()]);
    setLeadHours("24");
    setNote("");
    setInfoMessage(
      kitchenRequired
        ? "You can save plan details as a draft. Set up your kitchen and add an active dish before building its meal schedule."
        : availableMenu.length
        ? "Start with the customer-facing plan details. You will add the meal schedule next."
        : "You can save plan details as a draft. Add or activate a dish before building its meal schedule.",
    );
  }

  function selectPlan(planId: string) {
    setShowNew(false);
    setSelectedId(planId);
    setMessage("");
  }

  async function refreshWorkspace() {
    if (refreshing || busy) return;
    setRefreshing(true);
    try {
      await load();
      if (selected) await loadSchedule(selected);
      setSuccessMessage("Meal-plan workspace refreshed.");
    } catch (error) {
      setErrorMessage(
        chefErrorText(error, "The meal-plan workspace could not be refreshed."),
      );
    } finally {
      setRefreshing(false);
    }
  }

  const activeCount = plans.filter((plan) => plan.status === "ACTIVE").length;
  const pendingCount = plans.filter(
    (plan) => plan.status === "PENDING_APPROVAL",
  ).length;
  const draftCount = plans.filter(
    (plan) => plan.status === "DRAFT" || plan.status === "REJECTED",
  ).length;

  const currentStep = showNew ? 1 : selected && editable ? 2 : 3;

  const messageClass =
    messageTone === "success"
      ? "border-[#BBE8D0] bg-[#F3FBF6] text-[#166534]"
      : messageTone === "error"
        ? "border-[#F6C6C3] bg-[#FFF5F4] text-[#991B1B]"
        : "border-[#D8DEE3] bg-[#F8F9FA] text-[#1A1A1A]";

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Plans", String(plans.length), "All Chef meal plans"],
          ["Live", String(activeCount), "Approved plans"],
          ["In review", String(pendingCount), "Waiting for Admin"],
          ["Needs work", String(draftCount), "Drafts or changes requested"],
        ].map(([label, value, helper]) => (
          <div
            key={label}
            className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[var(--shadow-card)]"
          >
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-[#1A1A1A]">
              {value}
            </p>
            <p className="mt-1 text-xs text-[#6B6B6B]">{helper}</p>
          </div>
        ))}
      </section>

      {message ? (
        <div
          role={messageTone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm shadow-[var(--shadow-card)] ${messageClass}`}
        >
          {messageTone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : messageTone === "error" ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">{message}</span>
        </div>
      ) : null}

      {kitchenRequired ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#D8DEE3] bg-[#F8F9FA] p-4 text-sm shadow-[var(--shadow-card)]">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-flame-red)]" aria-hidden="true" />
          <div>
            <p className="font-bold text-[#1A1A1A]">Your kitchen setup is next</p>
            <p className="mt-1 leading-6 text-[#6B6B6B]">
              You can create and keep meal-plan drafts now. Set up your kitchen and add an active, available dish before saving a meal schedule or submitting a plan.
            </p>
            <Link
              href="/chef/kitchen"
              className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold text-[var(--color-flame-red)] underline-offset-4 hover:underline"
            >
              Set up my kitchen
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#1A1A1A]">
            Build once, then let Craves manage recurring fulfillment.
          </p>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            Your meal plan controls the meals and schedule. Capacity controls how many recurring commitments you can safely accept.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshWorkspace()}
          disabled={refreshing || busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#1A1A1A] transition hover:border-[var(--color-flame-red)] hover:text-[var(--color-flame-red)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[var(--shadow-card)] md:p-5">
        <StepIndicator current={currentStep} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <button
            type="button"
            onClick={beginNew}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-flame-red)] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--color-contrast-red)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-flame-red)] focus-visible:ring-offset-2"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Create new meal plan
          </button>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#1A1A1A]">My plans</h2>
                <p className="mt-1 text-xs text-[#6B6B6B]">
                  Select a plan to manage it.
                </p>
              </div>
              <span className="rounded-full bg-[#F1F3F5] px-3 py-1 text-xs font-bold text-[#1A1A1A]">
                {plans.length}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {plans.length === 0 ? (
                <div className="rounded-xl bg-[#F1F3F5] p-4">
                  <UtensilsCrossed
                    className="h-5 w-5 text-[var(--color-flame-red)]"
                    aria-hidden="true"
                  />
                  <p className="mt-2 text-sm font-semibold text-[#1A1A1A]">
                    No meal plans yet
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                    Create your first plan from dishes you already sell.
                  </p>
                </div>
              ) : (
                plans.map((plan) => {
                  const meta = statusMeta(plan.status);
                  return (
                    <button
                      type="button"
                      key={plan.id}
                      onClick={() => selectPlan(plan.id)}
                      aria-pressed={selectedId === plan.id}
                      className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-flame-red)] focus-visible:ring-offset-2 ${
                        selectedId === plan.id
                          ? "border-[var(--color-flame-red)] bg-[var(--color-flame-red)]/5"
                          : "border-[#E5E7EB] bg-white hover:border-[#B9DCC8]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5] text-[var(--color-flame-red)]">
                          <CalendarDays className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#1A1A1A]">
                            {plan.name}
                          </span>
                          <span className="mt-1 block text-xs text-[#6B6B6B]">
                            {plan.billingPeriod === "WEEKLY"
                              ? "Weekly"
                              : "Monthly"}{" "}
                            · {money(plan.amount, plan.currency)}
                          </span>
                          <span
                            className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${meta.className.split(" ").pop() ?? "text-[#6B6B6B]"}`}
                          >
                            <meta.icon
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {meta.label}
                          </span>
                        </span>
                        <ChevronRight
                          className="mt-1 h-4 w-4 shrink-0 text-[#9CA3AF]"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <CircleDollarSign
                className="h-5 w-5 text-[var(--color-flame-red)]"
                aria-hidden="true"
              />
              <h2 className="text-sm font-bold text-[#1A1A1A]">
                What customers pay
              </h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#6B6B6B]">
              The plan price is the recurring subscription amount. Use the description to explain what meals and value the customer receives.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-[var(--color-flame-red)]" aria-hidden="true" />
              <h2 className="text-sm font-bold text-[#1A1A1A]">
                Capacity is separate
              </h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#6B6B6B]">
              Your plan defines the recurring meals. Capacity protects your kitchen from taking more subscription commitments than you can serve.
            </p>
            <Link
              href="/chef/capacity"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--color-flame-red)] underline-offset-4 hover:underline"
            >
              Open advanced capacity
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>
        </aside>

        <section className="space-y-5">
          {showNew ? (
            <form
              onSubmit={createPlan}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)] md:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-flame-red)]/5 text-[var(--color-flame-red)]">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-flame-red)]">
                    Step 1
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1A1A1A]">
                    Start your meal plan
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                    Create the customer-facing details first. Craves links the draft to your signed-in Chef account automatically.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">
                  Plan name
                  <input
                    value={form.name}
                    onChange={(event) => setField("name", event.target.value)}
                    maxLength={160}
                    placeholder="Weekly home lunch plan"
                    className="mt-2 min-h-12 w-full rounded-xl border border-[#D8DEE3] bg-white px-4 text-[#1A1A1A] outline-none transition focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                    required
                  />
                  <span className="mt-1 block text-xs font-normal text-[#6B6B6B]">
                    Use a simple name customers can understand.
                  </span>
                </label>

                <label className="text-sm font-semibold text-[#1A1A1A]">
                  Frequency
                  <select
                    value={form.billingPeriod}
                    onChange={(event) => {
                      const period = event.target.value as ChefMealPlanPeriod;
                      setField("billingPeriod", period);
                      setRows([emptyMeal()]);
                    }}
                    className="mt-2 min-h-12 w-full rounded-xl border border-[#D8DEE3] bg-white px-4 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                  >
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </label>

                <label className="text-sm font-semibold text-[#1A1A1A]">
                  Subscription price (₹)
                  <input
                    value={form.amount}
                    onChange={(event) => setField("amount", event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="mt-2 min-h-12 w-full rounded-xl border border-[#D8DEE3] bg-white px-4 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                    required
                  />
                </label>

                <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">
                  Description
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setField("description", event.target.value)
                    }
                    maxLength={2000}
                    placeholder="Example: 5 homemade lunches every week, prepared fresh by my kitchen."
                    className="mt-2 min-h-28 w-full resize-y rounded-xl border border-[#D8DEE3] bg-white p-4 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                  />
                  <span className="mt-1 block text-xs font-normal text-[#6B6B6B]">
                    Explain what the customer receives. Avoid internal kitchen terminology.
                  </span>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-flame-red)] px-5 text-sm font-bold text-white transition hover:bg-[var(--color-contrast-red)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-flame-red)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create draft & continue
                </button>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#D8DEE3] bg-white px-5 text-sm font-bold text-[#1A1A1A] hover:border-[var(--color-flame-red)] disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : selected ? (
            <>
              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <StatusPill status={selected.status} />
                    <h2 className="mt-3 text-2xl font-bold tracking-tight text-[#1A1A1A]">
                      {selected.name}
                    </h2>
                    <p className="mt-1 text-sm text-[#6B6B6B]">
                      {selected.billingPeriod === "WEEKLY"
                        ? "Weekly"
                        : "Monthly"}{" "}
                      · {money(selected.amount, selected.currency)} ·{" "}
                      {selected.planCode}
                    </p>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6B6B6B]">
                      {selected.description ||
                        "No customer-facing description has been added yet."}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[var(--color-flame-red)]/5 px-5 py-4 text-right">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
                      Recurring price
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[var(--color-flame-red)]">
                      {money(selected.amount, selected.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[#6B6B6B]">
                      {selected.billingPeriod === "WEEKLY"
                        ? "per week"
                        : "per month"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#F8F9FA] p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B6B]">
                      Created
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
                      {formatDate(selected.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F8F9FA] p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B6B]">
                      Submitted
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
                      {formatDate(selected.submittedAt)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F8F9FA] p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B6B]">
                      Reviewed
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
                      {formatDate(selected.reviewedAt)}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-[#6B6B6B]">
                  {statusDescription(selected.status)}
                </p>

                {selected.reviewReason ? (
                  <div className="mt-4 rounded-xl border border-[#F3D7A1] bg-[#FFF7E6] p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className="mt-0.5 h-5 w-5 shrink-0 text-[#92400E]"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">
                          Admin review note
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#4B5563]">
                          {selected.reviewReason}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {editable ? (
                  <div className="mt-5 grid gap-4 border-t border-[#E5E7EB] pt-5 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">
                      Plan name
                      <input
                        value={form.name}
                        onChange={(event) =>
                          setField("name", event.target.value)
                        }
                        maxLength={160}
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                      />
                    </label>
                    <label className="text-sm font-semibold text-[#1A1A1A]">
                      Frequency
                      <select
                        value={form.billingPeriod}
                        onChange={(event) =>
                          setField(
                            "billingPeriod",
                            event.target.value as ChefMealPlanPeriod,
                          )
                        }
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                      >
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-[#1A1A1A]">
                      Price (₹)
                      <input
                        value={form.amount}
                        onChange={(event) =>
                          setField("amount", event.target.value)
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                      />
                    </label>
                    <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">
                      Description
                      <textarea
                        value={form.description}
                        onChange={(event) =>
                          setField("description", event.target.value)
                        }
                        maxLength={2000}
                        className="mt-2 min-h-20 w-full resize-y rounded-xl border border-[#D8DEE3] p-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveDetails()}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-flame-red)] bg-white px-4 text-sm font-bold text-[var(--color-flame-red)] hover:bg-[var(--color-flame-red)]/5 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Save plan details
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-flame-red)]/5 text-[var(--color-flame-red)]">
                      <CalendarDays className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-flame-red)]">
                        Step 2
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-[#1A1A1A]">
                        Build the meal schedule
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6B6B6B]">
                        Choose dishes from your active menu and tell Craves when each meal should be prepared.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex min-h-8 items-center rounded-full bg-[#F1F3F5] px-3 text-xs font-bold text-[#4B5563]">
                    {rows.length} meal{rows.length === 1 ? "" : "s"} configured
                  </span>
                </div>

                {!editable ? (
                  <div className="mt-5 rounded-xl border border-[#D8DEE3] bg-[#F8F9FA] p-4">
                    <div className="flex items-start gap-3">
                      <LockKeyhole
                        className="mt-0.5 h-5 w-5 shrink-0 text-[#6B6B6B]"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">
                          Schedule locked
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                          {statusDescription(selected.status)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {availableMenu.length === 0 ? (
                      <div className="mt-5 rounded-xl border border-[#F3D7A1] bg-[#FFF7E6] p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle
                            className="mt-0.5 h-5 w-5 shrink-0 text-[#92400E]"
                            aria-hidden="true"
                          />
                          <div>
                            <p className="text-sm font-bold text-[#1A1A1A]">
                              {kitchenRequired ? "Set up your kitchen first" : "Your menu is not ready yet"}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[#4B5563]">
                              {kitchenRequired
                                ? "Your draft is available. Set up your kitchen, then add an active, available dish to build its meal schedule."
                                : "Add or activate at least one available dish in Menu before submitting this meal plan."}
                            </p>
                            <Link
                              href={kitchenRequired ? "/chef/kitchen" : "/chef/menu"}
                              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--color-flame-red)] underline-offset-4 hover:underline"
                            >
                              {kitchenRequired ? "Go to kitchen setup" : "Manage menu"}
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] p-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-[#1A1A1A]">
                          Preparation lead time
                          <div className="mt-2 flex">
                            <input
                              type="number"
                              min="1"
                              max="168"
                              value={leadHours}
                              onChange={(event) =>
                                setLeadHours(event.target.value)
                              }
                              className="min-h-11 w-full rounded-l-xl border border-r-0 border-[#D8DEE3] bg-white px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                            />
                            <span className="inline-flex min-h-11 items-center rounded-r-xl border border-[#D8DEE3] bg-[#F1F3F5] px-3 text-xs font-bold text-[#6B6B6B]">
                              hours
                            </span>
                          </div>
                          <span className="mt-1 block text-xs font-normal text-[#6B6B6B]">
                            How far ahead Craves should generate recurring meal work.
                          </span>
                        </label>
                        <div className="rounded-xl border border-[#D8DEE3] bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B6B]">
                            Timezone
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
                            {typeof Intl !== "undefined"
                              ? Intl.DateTimeFormat().resolvedOptions().timeZone ||
                                "Asia/Kolkata"
                              : "Asia/Kolkata"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                            Service times are interpreted in this kitchen schedule timezone.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {rows.map((row, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-flame-red)]/5 text-sm font-bold text-[var(--color-flame-red)]">
                                {index + 1}
                              </span>
                              <div>
                                <p className="text-sm font-bold text-[#1A1A1A]">
                                  Meal {index + 1}
                                </p>
                                <p className="text-xs text-[#6B6B6B]">
                                  {row.menuItemId
                                    ? availableMenu.find(
                                        (item) => item.id === row.menuItemId,
                                      )?.itemName ?? "Selected dish"
                                    : "Choose a dish"}
                                </p>
                              </div>
                            </div>
                            {rows.length > 1 ? (
                              <button
                                type="button"
                                aria-label={`Remove meal ${index + 1}`}
                                onClick={() =>
                                  setRows((current) =>
                                    current.filter(
                                      (_, rowIndex) => rowIndex !== index,
                                    ),
                                  )
                                }
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B6B6B] hover:border-[#F6C6C3] hover:text-[#B91C1C]"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.7fr_.8fr_.8fr]">
                            <label className="text-xs font-bold uppercase tracking-[0.05em] text-[#6B6B6B]">
                              {selected.billingPeriod === "WEEKLY"
                                ? "Day"
                                : "Day of month"}
                              {selected.billingPeriod === "WEEKLY" ? (
                                <select
                                  value={row.day}
                                  onChange={(event) =>
                                    updateRow(
                                      index,
                                      "day",
                                      event.target.value,
                                    )
                                  }
                                  className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-sm font-normal normal-case text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                                >
                                  {WEEKDAYS.map((day, dayIndex) => (
                                    <option key={day} value={dayIndex + 1}>
                                      {day}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="number"
                                  min="1"
                                  max="28"
                                  value={row.day}
                                  onChange={(event) =>
                                    updateRow(
                                      index,
                                      "day",
                                      event.target.value,
                                    )
                                  }
                                  className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-sm font-normal normal-case text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                                />
                              )}
                            </label>

                            <label className="text-xs font-bold uppercase tracking-[0.05em] text-[#6B6B6B]">
                              Meal
                              <select
                                value={row.mealSlotCode}
                                onChange={(event) =>
                                  updateRow(
                                    index,
                                    "mealSlotCode",
                                    event.target.value,
                                  )
                                }
                                className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-sm font-normal normal-case text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                              >
                                {MEAL_SLOTS.map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="text-xs font-bold uppercase tracking-[0.05em] text-[#6B6B6B]">
                              Dish
                              <select
                                value={row.menuItemId}
                                onChange={(event) =>
                                  updateRow(
                                    index,
                                    "menuItemId",
                                    event.target.value,
                                  )
                                }
                                className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-sm font-normal normal-case text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                              >
                                <option value="">Choose a dish</option>
                                {availableMenu.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.itemName} ·{" "}
                                    {money(item.price, item.currency)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="text-xs font-bold uppercase tracking-[0.05em] text-[#6B6B6B]">
                              Time
                              <input
                                type="time"
                                value={row.serviceTime}
                                onChange={(event) =>
                                  updateRow(
                                    index,
                                    "serviceTime",
                                    event.target.value,
                                  )
                                }
                                className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-sm font-normal normal-case text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                              />
                            </label>

                            <label className="text-xs font-bold uppercase tracking-[0.05em] text-[#6B6B6B]">
                              Qty
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={row.quantity}
                                onChange={(event) =>
                                  updateRow(
                                    index,
                                    "quantity",
                                    event.target.value,
                                  )
                                }
                                className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-sm font-normal normal-case text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                              />
                            </label>
                          </div>

                          <div className="mt-3 rounded-xl bg-[#F8F9FA] px-3 py-2 text-xs text-[#6B6B6B]">
                            {dayLabel(row.day, selected.billingPeriod)} ·{" "}
                            {row.mealSlotCode.toLowerCase()} ·{" "}
                            {row.serviceTime || "time not set"} ·{" "}
                            {row.quantity || "0"} portion
                            {row.quantity === "1" ? "" : "s"}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={busy || availableMenu.length === 0}
                      onClick={() =>
                        setRows((current) => [...current, emptyMeal()])
                      }
                      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[var(--color-flame-red)] bg-[#F8FFFA] px-4 text-sm font-bold text-[var(--color-flame-red)] hover:bg-[var(--color-flame-red)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add another meal
                    </button>

                    <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-[#F8F9FA] p-4">
                      <div className="flex items-start gap-3">
                        <UtensilsCrossed
                          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-flame-red)]"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-bold text-[#1A1A1A]">
                            Schedule preview
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedScheduleRows.length === 0 ? (
                              <span className="text-xs text-[#6B6B6B]">
                                Add a valid meal row to see the preview.
                              </span>
                            ) : (
                              selectedScheduleRows.map((row, index) => {
                                const dish = availableMenu.find(
                                  (item) => item.id === row.menuItemId,
                                );
                                return (
                                  <span
                                    key={`${row.day}-${row.mealSlotCode}-${row.menuItemId}-${index}`}
                                    className="rounded-full border border-[#D8DEE3] bg-white px-3 py-2 text-xs font-semibold text-[#1A1A1A]"
                                  >
                                    {dayLabel(row.day, selected.billingPeriod)} ·{" "}
                                    {row.mealSlotCode.toLowerCase()} ·{" "}
                                    {dish?.itemName ?? "Dish"} · {row.serviceTime}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-flame-red)]/5 text-[var(--color-flame-red)]">
                      <Gauge className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-flame-red)]">
                        Capacity
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-[#1A1A1A]">
                        Protect your recurring availability
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6B6B6B]">
                        Capacity is Chef-level and separate from the meal plan. Craves also fills missing safe defaults when you submit a plan.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/chef/capacity"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D8DEE3] bg-white px-4 text-sm font-bold text-[var(--color-flame-red)] hover:border-[var(--color-flame-red)] hover:bg-[var(--color-flame-red)]/5"
                  >
                    Advanced capacity
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>

                {capacity?.adminSalesFrozen ? (
                  <div className="mt-5 rounded-xl border border-[#F6C6C3] bg-[#FFF5F4] p-4">
                    <div className="flex items-start gap-3">
                      <LockKeyhole
                        className="mt-0.5 h-5 w-5 shrink-0 text-[#B91C1C]"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">
                          Subscription sales are frozen
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#4B5563]">
                          {capacity.freezeReason ||
                            "Admin has temporarily frozen new subscription sales."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#F8F9FA] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B6B]">
                      Slot rules
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[#1A1A1A]">
                      {capacity?.slotRules.length ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F8F9FA] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B6B]">
                      Available units
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[#1A1A1A]">
                      {capacity
                        ? capacity.slotRules.reduce(
                            (sum, rule) => sum + rule.recurringAvailableUnits,
                            0,
                          )
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F8F9FA] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B6B]">
                      Open incidents
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold ${
                        capacity && capacity.openIncidentCount > 0
                          ? "text-[#B91C1C]"
                          : "text-[#1A1A1A]"
                      }`}
                    >
                      {capacity?.openIncidentCount ?? "—"}
                    </p>
                  </div>
                </div>

                {matchingCapacityRules.length > 0 ? (
                  <div className="mt-5 rounded-xl border border-[#BBE8D0] bg-[#F3FBF6] p-4">
                    <p className="text-sm font-bold text-[#1A1A1A]">
                      Capacity matching this plan
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {matchingCapacityRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="rounded-lg bg-white p-3"
                        >
                          <p className="text-sm font-semibold text-[#1A1A1A]">
                            {WEEKDAYS[rule.isoDayOfWeek - 1]} ·{" "}
                            {rule.mealSlotCode.toLowerCase()}
                          </p>
                          <p className="mt-1 text-xs text-[#6B6B6B]">
                            {rule.subscriptionCapacityUnits} subscription units ·{" "}
                            {rule.recurringReservedUnits} reserved ·{" "}
                            {rule.recurringAvailableUnits} available
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] p-4 text-sm leading-6 text-[#6B6B6B]">
                    No explicit capacity rule matches the schedule yet. That is
                    allowed: Craves can create safe missing defaults when the
                    plan is submitted.
                  </div>
                )}

                <div className="mt-5 border-t border-[#E5E7EB] pt-5">
                  <p className="text-sm font-bold text-[#1A1A1A]">
                    Quick slot override
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                    Use this only when you want to override the automatic capacity for one recurring weekday and meal slot.
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <label className="text-sm font-semibold text-[#1A1A1A]">
                      Day
                      <select
                        value={capacityDay}
                        onChange={(event) =>
                          setCapacityDay(event.target.value)
                        }
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                      >
                        {WEEKDAYS.map((day, index) => (
                          <option key={day} value={index + 1}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-semibold text-[#1A1A1A]">
                      Meal slot
                      <select
                        value={capacitySlot}
                        onChange={(event) =>
                          setCapacitySlot(event.target.value)
                        }
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                      >
                        {MEAL_SLOTS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-semibold text-[#1A1A1A]">
                      Total kitchen units
                      <input
                        type="number"
                        min="0"
                        value={totalCapacity}
                        onChange={(event) =>
                          setTotalCapacity(event.target.value)
                        }
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                      />
                    </label>

                    <label className="text-sm font-semibold text-[#1A1A1A]">
                      Subscription units
                      <input
                        type="number"
                        min="0"
                        value={subscriptionCapacity}
                        onChange={(event) =>
                          setSubscriptionCapacity(event.target.value)
                        }
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEE3] bg-white px-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)]"
                      />
                    </label>
                  </div>

                  <label className="mt-4 flex min-h-11 items-start gap-3 rounded-xl bg-[#F8F9FA] p-3 text-sm text-[#1A1A1A]">
                    <input
                      type="checkbox"
                      checked={capacitySalesEnabled}
                      onChange={(event) =>
                        setCapacitySalesEnabled(event.target.checked)
                      }
                      className="mt-1 h-4 w-4 accent-[var(--color-flame-red)]"
                    />
                    <span>
                      <span className="block font-bold">
                        Accept new subscription commitments for this slot
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#6B6B6B]">
                        Turn this off when you want to stop new recurring reservations without changing the plan itself.
                      </span>
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={busy || capacity?.adminSalesFrozen}
                    onClick={() => void saveCapacity()}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-flame-red)] bg-white px-4 text-sm font-bold text-[var(--color-flame-red)] hover:bg-[var(--color-flame-red)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Gauge className="h-4 w-4" aria-hidden="true" />
                    Save capacity
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-flame-red)]/5 text-[var(--color-flame-red)]">
                    <Send className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-flame-red)]">
                      Step 3
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-[#1A1A1A]">
                      Review & submit
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                      Check the plan before sending it to Craves Admin.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    [
                      readiness.detailsReady,
                      "Plan details",
                      "Name and price are ready.",
                    ],
                    [
                      readiness.scheduleReady,
                      "Meal schedule",
                      "At least one valid meal is configured.",
                    ],
                    [
                      readiness.dishesReady,
                      "Live dishes",
                      "Every selected dish is active and available.",
                    ],
                  ].map(([ready, title, description]) => (
                    <div
                      key={String(title)}
                      className={`rounded-xl border p-4 ${
                        ready
                          ? "border-[#BBE8D0] bg-[#F3FBF6]"
                          : "border-[#E5E7EB] bg-[#F8F9FA]"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                            ready
                              ? "bg-[var(--color-flame-red)] text-white"
                              : "bg-[#E5E7EB] text-[#6B6B6B]"
                          }`}
                        >
                          {ready ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <span className="text-xs font-bold">!</span>
                          )}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-[#1A1A1A]">
                            {title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                            {description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {editable ? (
                  <>
                    <label className="mt-5 block text-sm font-semibold text-[#1A1A1A]">
                      Note for Admin{" "}
                      <span className="font-normal text-[#6B6B6B]">
                        (optional)
                      </span>
                      <textarea
                        maxLength={1000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Anything the reviewer should know about this plan."
                        className="mt-2 min-h-24 w-full resize-y rounded-xl border border-[#D8DEE3] p-3 text-[#1A1A1A] outline-none focus:border-[var(--color-flame-red)] focus:ring-2 focus:ring-[var(--color-flame-red)]/15"
                      />
                    </label>

                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveSchedule(false)}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--color-flame-red)] bg-white px-5 text-sm font-bold text-[var(--color-flame-red)] hover:bg-[var(--color-flame-red)]/5 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Save draft
                      </button>

                      <button
                        type="button"
                        disabled={
                          busy ||
                          availableMenu.length === 0 ||
                          !readiness.detailsReady ||
                          !readiness.scheduleReady ||
                          !readiness.dishesReady
                        }
                        onClick={() => void saveSchedule(true)}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-flame-red)] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--color-contrast-red)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-flame-red)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" aria-hidden="true" />
                        Save & submit for approval
                      </button>
                    </div>

                    <p className="mt-3 text-center text-xs leading-5 text-[#6B6B6B]">
                      After submission, the plan and schedule are locked until
                      Admin completes the review.
                    </p>
                  </>
                ) : (
                  <div className="mt-5 rounded-xl border border-[#D8DEE3] bg-[#F8F9FA] p-4">
                    <div className="flex items-start gap-3">
                      <LockKeyhole
                        className="mt-0.5 h-5 w-5 shrink-0 text-[#6B6B6B]"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">
                          Submission controls are locked
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                          {statusDescription(selected.status)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-dashed border-[#D8DEE3] bg-white p-10 text-center shadow-[var(--shadow-card)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-flame-red)]/5 text-[var(--color-flame-red)]">
                <CalendarDays className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#1A1A1A]">
                Create your first meal plan
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B6B6B]">
                Package the dishes you already prepare into a weekly or monthly
                recurring meal plan. Craves will validate the schedule,
                capacity and Chef ownership on the server.
              </p>
              <button
                type="button"
                onClick={beginNew}
                className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--color-flame-red)] px-5 text-sm font-bold text-white hover:bg-[var(--color-contrast-red)]"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                Create meal plan
              </button>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

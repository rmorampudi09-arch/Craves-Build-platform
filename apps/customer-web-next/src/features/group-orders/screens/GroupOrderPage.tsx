"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { signInPath, useSignedIn } from "@/features/auth/lib/use-signed-in";
import { loadCart } from "@/features/cart/api/cravesCart";
import { loadKitchenMenu, type Dish } from "@/features/dish/api/dishes";
import type { AdvancedResult } from "@/shared/lib/advanced-client";
import { getKitchenProfile } from "@/shared/lib/kitchen-profile-client";
import { formatDishPrice } from "@/shared/lib/kitchen-dish-summary";
import { BackHeader } from "@/shared/components/navigation/BackHeader";
import { CartStepper } from "@/shared/ui/buttons/CartStepper";
import { outlineButton, quietButton } from "@/shared/ui/buttons/pill-buttons";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { cancelGroup, getGroup, leaveGroup, lockGroup, removeMyDish, removePerson, reopenGroup, sendToCart, setMyDish } from "../api/group-orders";
import { MAX_DISH_PER_ORDER, MAX_DISH_PER_PERSON, groupErrorText, joinDeadline, overOrderLimit, type GroupOrder } from "../lib/group-order-contract";

type Failure = { code: string; status: number };
type Asking = null | { kind: "leave" | "cancel" | "replace-cart" } | { kind: "remove"; participantId: string; name: string };
/** Where a message shows: next to what the person just did. */
type Notice = { kind: "ok" | "error"; text: string; where: "top" | "menu" | "people" | "actions" };

// After these answers the group on screen is out of date: read it again.
const STALE = new Set(["GROUP_LOCKED", "GROUP_CLOSED", "GROUP_NOT_OPEN", "GROUP_CHECKED_OUT", "VERSION_MISMATCH", "PARTICIPANT_NOT_FOUND", "ITEM_NOT_FOUND", "HOST_ONLY"]);
// A send that failed this way may have filled part of the host's cart (the service fills it one dish at a time).
const MAY_HAVE_FILLED = new Set(["CART_REJECTED", "CART_UNAVAILABLE", "ADVANCED_UNAVAILABLE", "NETWORK", "INVALID_RESPONSE", "REQUEST_FAILED", "ADVANCED_REQUEST_FAILED"]);
const REOPEN_MINUTES = 30;
const LOOK_EVERY_MS = 20_000;
const rupees = (paise: number) => formatDishPrice(paise / 100);
const dishCount = (count: number) => `${count} ${count === 1 ? "dish" : "dishes"}`;

function NoticeLine({ notice, where }: { notice: Notice | null; where: Notice["where"] }) {
  if (notice?.where !== where) return null;
  return (
    <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm font-semibold ${notice.kind === "error" ? "text-[#C4200F]" : "text-[#1A1A1A]"}`}>
      {notice.text}
    </p>
  );
}

function Confirm({ text, action, busy, confirmRef, onYes, onNo }: { text: string; action: string; busy: boolean; confirmRef: RefObject<HTMLButtonElement | null>; onYes: () => void; onNo: () => void }) {
  return (
    <div role="group" aria-label="Confirm" className="mt-3 rounded-xl bg-[#F1F3F5] p-3">
      <p id="group-confirm" className="text-[0.9375rem] text-[#1A1A1A]">
        {text}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button ref={confirmRef} aria-describedby="group-confirm" type="button" className={outlineButton} disabled={busy} onClick={onYes}>
          {action}
        </button>
        <button type="button" className={quietButton} onClick={onNo}>
          Not now
        </button>
      </div>
    </div>
  );
}

/** /group-orders/<id>: one group order. Everyone adds their own dishes; the host locks it and sends it all to their cart. */
export default function GroupOrderPage({ groupId }: { groupId: string }) {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [group, setGroup] = useState<GroupOrder | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [kitchen, setKitchen] = useState<string | null>(null);
  const [kitchenGone, setKitchenGone] = useState(false);
  const [menu, setMenu] = useState<Dish[] | "failed" | null>(null);
  // After a send that may have filled part of the cart, the next send replaces what is in the cart.
  const [resend, setResend] = useState(false);

  // Only a group at least as new as the one on screen may replace it, so a slow look never undoes a change.
  const shown = useRef<GroupOrder | null>(null);
  const apply = useCallback((next: GroupOrder) => {
    if (shown.current && next.version < shown.current.version) return;
    shown.current = next;
    setGroup(next);
    // "Send again" belongs to one locked basket; once it is reopened or sent, a send asks about the cart again.
    if (next.status !== "LOCKED") setResend(false);
  }, []);
  const load = useCallback(
    async (quiet = false): Promise<AdvancedResult<GroupOrder>> => {
      const result = await getGroup(groupId);
      if (result.ok) {
        apply(result.data);
        setFailure(null);
      } else if (!quiet || result.code === "GROUP_NOT_FOUND") {
        setFailure({ code: result.code, status: result.status });
      }
      return result;
    },
    [groupId, apply],
  );
  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  // Friends add dishes from their own phones: look again every 20 s while the page is in view, and on coming back to it.
  const gone = failure?.code === "GROUP_NOT_FOUND";
  const live = !gone && (group?.status === "OPEN" || group?.status === "LOCKED");
  useEffect(() => {
    if (!live) return;
    const look = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(look, LOOK_EVERY_MS);
    document.addEventListener("visibilitychange", look);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [live, load]);

  const kitchenId = group?.kitchenId;
  useEffect(() => {
    if (!kitchenId) return;
    let current = true;
    getKitchenProfile(kitchenId).then(
      (profile) => {
        if (!current) return;
        setKitchen(profile ? profile.displayName || profile.kitchenName : null);
        setKitchenGone(!profile);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [kitchenId]);

  const open = group?.status === "OPEN";
  const loadMenu = useCallback(() => {
    if (!kitchenId) return;
    setMenu(null);
    loadKitchenMenu(kitchenId, { remember: false }).then(setMenu, () => setMenu("failed"));
  }, [kitchenId]);
  useEffect(() => {
    if (open) loadMenu();
  }, [open, loadMenu]);

  // A confirm step moves focus to its action, and back to the button that opened it (or the title) when it closes.
  const mainRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (asking) {
      asked.current = asking.kind === "remove" ? `remove-${asking.participantId}` : asking.kind;
      confirmRef.current?.focus();
    } else if (asked.current) {
      const opener = mainRef.current?.querySelector<HTMLElement>(`[data-opens="${asked.current}"]:not(:disabled)`);
      (opener ?? mainRef.current?.querySelector<HTMLElement>("#group-heading"))?.focus();
      asked.current = null;
    }
  }, [asking]);

  async function act(run: () => Promise<AdvancedResult<GroupOrder>>, where: Notice["where"], done?: string) {
    setBusy(true);
    setNotice(null);
    setAsking(null);
    const result = await run();
    setBusy(false);
    if (result.ok) {
      apply(result.data);
      if (done) setNotice({ kind: "ok", text: done, where });
      return;
    }
    if (result.status === 401) return navigate({ to: signInPath(`/group-orders/${groupId}`) });
    // A stale answer changes the page under the person (the menu may go away), so say why at the top.
    setNotice({ kind: "error", text: groupErrorText(result.code, result.status), where: STALE.has(result.code) ? "top" : where });
    if (result.code === "GROUP_NOT_FOUND") setFailure({ code: result.code, status: result.status });
    else if (STALE.has(result.code)) void load(true);
  }

  const setQuantity = (menuItemId: string, quantity: number) =>
    act(() => (quantity > 0 ? setMyDish(groupId, menuItemId, quantity) : removeMyDish(groupId, menuItemId)), "menu");

  async function leave() {
    setBusy(true);
    setNotice(null);
    const result = await leaveGroup(groupId);
    if (result.ok) return navigate({ to: "/group-orders" });
    setBusy(false);
    setAsking(null);
    if (result.status === 401) return navigate({ to: signInPath(`/group-orders/${groupId}`) });
    if (result.code === "GROUP_NOT_FOUND") return setFailure({ code: result.code, status: result.status });
    setNotice({ kind: "error", text: groupErrorText(result.code, result.status), where: "actions" });
    if (STALE.has(result.code)) void load(true);
  }

  async function openCart() {
    // The header's cart count; the cart page reads the cart again either way.
    await loadCart().catch(() => undefined);
    navigate({ to: "/cart" });
  }

  async function unavailableText(): Promise<string> {
    const current = shown.current;
    const onMenuNow = current ? await loadKitchenMenu(current.kitchenId, { remember: false }).catch(() => null) : null;
    if (!current || !onMenuNow) return groupErrorText("ITEMS_UNAVAILABLE", 409);
    const ids = new Set(onMenuNow.map((dish) => dish.id));
    const names = [...new Set(current.participants.flatMap((person) => person.items).filter((item) => !ids.has(item.menuItemId)).map((item) => item.itemName))];
    return names.length ? `These dishes can't be ordered now: ${names.join(", ")}. Reopen the group order so people can change them.` : groupErrorText("ITEMS_UNAVAILABLE", 409);
  }

  async function send(replaceCart: boolean) {
    setBusy(true);
    setNotice(null);
    setAsking(null);
    const result = await sendToCart(groupId, replaceCart);
    if (result.ok) return openCart();
    if (result.code === "HOST_CART_NOT_EMPTY") {
      setBusy(false);
      return setAsking({ kind: "replace-cart" });
    }
    if (result.status === 401) return navigate({ to: signInPath(`/group-orders/${groupId}`) });
    // The service may have finished after the site stopped waiting, or filled part of the cart: look again first.
    const now = await load(true);
    if (now.ok && now.data.status === "CHECKED_OUT") return openCart();
    if (result.code === "ITEMS_UNAVAILABLE") {
      const text = await unavailableText();
      setBusy(false);
      return setNotice({ kind: "error", text, where: "actions" });
    }
    setBusy(false);
    // FEATURE_* answers come from the service's gate, before it touches the cart.
    const partial = MAY_HAVE_FILLED.has(result.code) || (result.status >= 500 && !result.code.startsWith("FEATURE_"));
    if (partial) {
      setResend(true);
      void loadCart().catch(() => undefined);
    }
    const tail = partial ? " Your cart may hold part of the group's order. Send again to replace it." : "";
    setNotice({ kind: "error", text: `${groupErrorText(result.code, result.status)}${tail}`, where: "actions" });
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ kind: "ok", text: "Link copied.", where: "people" });
    } catch {
      setNotice({ kind: "error", text: "Copy didn't work here. Select the link and copy it.", where: "people" });
    }
  }

  const page = (body: ReactNode) => (
    <main ref={mainRef} className="min-h-screen bg-white pb-16">
      <BackHeader title="Group order" backTo="/group-orders" backLabel="Back to your group orders" />
      <div className="mx-auto max-w-2xl px-4 pt-5 md:px-6">{body}</div>
    </main>
  );

  if (signedIn === false) {
    return page(
      <EmptyState illustration="saved" heading="h1" title="Sign in to see this group order" message="Group orders are for the people in them.">
        <Link to={signInPath(`/group-orders/${groupId}`)} className={outlineButton}>
          Sign in
        </Link>
      </EmptyState>,
    );
  }
  if (gone) {
    return page(
      <EmptyState illustration="notFound" heading="h1" title="You're not in this group order" message="It may have ended, or the host removed you.">
        <Link to="/group-orders" className={outlineButton}>
          Your group orders
        </Link>
      </EmptyState>,
    );
  }
  if (!group) {
    return page(
      failure ? (
        <EmptyState illustration="offline" heading="h1" role="alert" title="This group order couldn't be opened" message={groupErrorText(failure.code, failure.status)}>
          <button type="button" className={outlineButton} onClick={() => void load()}>
            Try again
          </button>
        </EmptyState>
      ) : (
        <p role="status" className="py-16 text-center text-[0.9375rem] text-[#6B6B6B]">
          Opening the group order…
        </p>
      ),
    );
  }

  const me = group.participants.find((person) => person.you);
  const mine = new Map(me?.items.map((item) => [item.menuItemId, item.quantity]) ?? []);
  const host = group.participants.find((person) => person.role === "HOST")?.displayName ?? "The host";
  const active = group.status === "OPEN" || group.status === "LOCKED";
  const tooMany = overOrderLimit(group);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = group.joinCode ? (group.shareUrl ?? `${origin}/g/${group.joinCode}`) : null;
  const status = {
    OPEN: `Open: people can join and add dishes until ${joinDeadline(group.joinUntil)}.`,
    LOCKED: group.youAreHost ? "Locked: no one can change dishes now. Send it to your cart, or reopen it." : "Locked: no one can change dishes now. The host can send it to their cart.",
    CHECKED_OUT: group.youAreHost ? "Sent to your cart." : `${host} sent this order to their cart.`,
    CANCELLED: "The host cancelled this group order.",
  }[group.status];

  return page(
    <>
      <h1 id="group-heading" tabIndex={-1} className="text-2xl font-black text-[#1A1A1A] focus:outline-none">
        {group.title}
      </h1>
      {kitchen ? (
        <p className="mt-1 text-[0.9375rem] text-[#4A4A4A]">
          From{" "}
          <Link to="/kitchen/$id" params={{ id: group.kitchenId }} className="font-semibold text-[#C92716] underline underline-offset-4">
            {kitchen}
          </Link>
        </p>
      ) : null}
      <p className="mt-3 rounded-2xl bg-[#F1F3F5] px-4 py-3 text-[0.9375rem] font-semibold text-[#1A1A1A]">{status}</p>
      <NoticeLine notice={notice} where="top" />

      {link ? (
        <section aria-labelledby="invite-heading" className="mt-6 rounded-2xl border border-[#E5E7EB] p-4 md:p-5">
          <h2 id="invite-heading" className="text-lg font-black text-[#1A1A1A]">
            Invite people
          </h2>
          <p className="mt-1 text-[0.9375rem] text-[#4A4A4A]">
            Send the link, or read out the code <strong className="font-bold tracking-wide text-[#1A1A1A]">{group.joinCode}</strong>. Anyone with it can join until {joinDeadline(group.joinUntil)}.
          </p>
          <input readOnly value={link} aria-label="Group order link" onFocus={(event) => event.currentTarget.select()} className="mt-3 min-h-11 w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-3 text-[0.9375rem]" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={outlineButton} onClick={() => void copy(link)}>
              Copy link
            </button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <button type="button" className={outlineButton} onClick={() => void navigator.share({ title: group.title, url: link }).catch(() => undefined)}>
                Share
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {open && me ? (
        <section aria-labelledby="menu-heading" className="mt-8">
          <h2 id="menu-heading" className="text-lg font-black text-[#1A1A1A]">
            Add your dishes
          </h2>
          <p className="mt-1 text-sm text-[#6B6B6B]">Up to {MAX_DISH_PER_PERSON} of each dish. Everyone in the group sees what you choose.</p>
          <NoticeLine notice={notice} where="menu" />
          {kitchenGone ? (
            <p className="mt-3 text-[0.9375rem] text-[#4A4A4A]">This kitchen isn&apos;t on Craves any more.</p>
          ) : menu === null ? (
            <p role="status" className="mt-3 text-[0.9375rem] text-[#6B6B6B]">
              Opening the menu…
            </p>
          ) : menu === "failed" ? (
            <p className="mt-3 text-[0.9375rem] text-[#4A4A4A]">
              The menu couldn&apos;t load.{" "}
              <button type="button" className="font-semibold text-[#C92716] underline underline-offset-4" onClick={loadMenu}>
                Try again
              </button>
            </p>
          ) : menu.length === 0 ? (
            <p className="mt-3 text-[0.9375rem] text-[#4A4A4A]">This kitchen has no dishes right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]" aria-label="The kitchen's dishes">
              {menu.map((dish) => {
                const quantity = mine.get(dish.id) ?? 0;
                return (
                  <li key={dish.id} className="flex min-h-16 items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold leading-snug text-[#1A1A1A]">{dish.name}</span>
                      <span className="block text-sm tabular-nums text-[#4A4A4A]">{formatDishPrice(dish.price)}</span>
                    </span>
                    <CartStepper
                      name={dish.name}
                      place="your share"
                      quantity={quantity}
                      onAdd={() => void setQuantity(dish.id, 1)}
                      onChange={(next) => void setQuantity(dish.id, next)}
                      canAdd={quantity < MAX_DISH_PER_PERSON}
                      disabled={busy}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="people-heading" className="mt-8">
        <h2 id="people-heading" className="text-lg font-black text-[#1A1A1A]">
          Everyone&apos;s dishes
        </h2>
        <NoticeLine notice={notice} where="people" />
        <ul className="mt-3 grid gap-3">
          {group.participants.map((person, index) => (
            <li key={`${person.participantId ?? person.displayName}-${index}`} className="rounded-2xl border border-[#E5E7EB] p-4">
              <p className="text-base font-bold text-[#1A1A1A]">
                {person.displayName}
                <span className="font-normal text-[#6B6B6B]">
                  {person.you ? " (you)" : ""}
                  {person.role === "HOST" ? ", host" : ""}
                </span>
              </p>
              {person.items.length ? (
                <ul className="mt-2 grid gap-1">
                  {person.items.map((item) => (
                    <li key={item.menuItemId} className="flex min-h-8 items-center gap-3 text-[0.9375rem] text-[#1A1A1A]">
                      <span className="min-w-0 flex-1">
                        {item.quantity} × {item.itemName}
                      </span>
                      <span className="shrink-0 tabular-nums">{rupees(item.lineTotalPaise)}</span>
                      {person.you && open ? (
                        <button type="button" className={quietButton} disabled={busy} aria-label={`Remove ${item.itemName} from your share`} onClick={() => void act(() => removeMyDish(groupId, item.menuItemId), "people")}>
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[0.9375rem] text-[#6B6B6B]">No dishes yet.</p>
              )}
              {person.items.length > 1 ? <p className="mt-2 text-sm font-semibold tabular-nums text-[#4A4A4A]">{rupees(person.subtotalPaise)} in all</p> : null}
              {group.youAreHost && !person.you && person.participantId && active ? (
                asking?.kind === "remove" && asking.participantId === person.participantId ? (
                  <Confirm
                    text={`Remove ${person.displayName}? Their dishes come out of the order.`}
                    action="Remove"
                    busy={busy}
                    confirmRef={confirmRef}
                    onYes={() => void act(() => removePerson(groupId, asking.participantId), "people", `${asking.name} removed.`)}
                    onNo={() => setAsking(null)}
                  />
                ) : (
                  <button
                    type="button"
                    data-opens={`remove-${person.participantId}`}
                    className={`${quietButton} mt-2 !px-0`}
                    disabled={busy}
                    onClick={() => setAsking({ kind: "remove", participantId: person.participantId as string, name: person.displayName })}
                  >
                    Remove {person.displayName}
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.9375rem] text-[#1A1A1A]">
          <strong className="font-bold tabular-nums">
            {dishCount(group.itemCount)}, {rupees(group.subtotalPaise)}
          </strong>{" "}
          before delivery and taxes. Prices are checked again at checkout.
        </p>
      </section>

      <section aria-label="What you can do" className="mt-8">
        {group.youAreHost && group.status === "LOCKED" && tooMany.length ? (
          <p className="mb-3 text-[0.9375rem] text-[#C4200F]">
            {tooMany.map((dish) => `${dish.quantity} × ${dish.itemName}`).join(" and ")} {tooMany.length === 1 ? "is" : "are"} more than one order can hold ({MAX_DISH_PER_ORDER} of a dish). Reopen the group order so people can lower {tooMany.length === 1 ? "it" : "them"}.
          </p>
        ) : null}
        {group.youAreHost && group.status === "LOCKED" && group.itemCount === 0 ? <p className="mb-3 text-[0.9375rem] text-[#4A4A4A]">Nobody has added a dish yet.</p> : null}
        {asking && asking.kind !== "remove" ? (
          <Confirm
            text={
              asking.kind === "leave"
                ? "Leave this group order? Your dishes come out of it."
                : asking.kind === "cancel"
                  ? "Cancel this group order for everyone? Nothing is ordered."
                  : "Your cart has other dishes. Replace them with the group's dishes?"
            }
            action={asking.kind === "leave" ? "Leave" : asking.kind === "cancel" ? "Cancel the group order" : "Replace my cart"}
            busy={busy}
            confirmRef={confirmRef}
            onYes={() => void (asking.kind === "leave" ? leave() : asking.kind === "cancel" ? act(() => cancelGroup(groupId), "actions", "Group order cancelled.") : send(true))}
            onNo={() => setAsking(null)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {group.youAreHost && group.status === "OPEN" ? (
              <button type="button" className={outlineButton} disabled={busy} onClick={() => void act(() => lockGroup(groupId), "actions", "Locked. No one can change dishes now.")}>
                Lock now
              </button>
            ) : null}
            {group.youAreHost && group.status === "LOCKED" ? (
              <>
                <button type="button" data-opens="replace-cart" className={outlineButton} disabled={busy || tooMany.length > 0 || group.itemCount === 0} onClick={() => void send(resend)}>
                  {busy ? "Sending…" : resend ? "Send again" : "Send to my cart"}
                </button>
                <button type="button" className={quietButton} disabled={busy} onClick={() => void act(() => reopenGroup(groupId, REOPEN_MINUTES), "actions", `Open again for ${REOPEN_MINUTES} minutes.`)}>
                  Reopen for {REOPEN_MINUTES} minutes
                </button>
              </>
            ) : null}
            {group.youAreHost && group.status === "CHECKED_OUT" ? (
              <Link to="/cart" className={outlineButton}>
                Open my cart
              </Link>
            ) : null}
            {group.youAreHost && active ? (
              <button type="button" data-opens="cancel" className={quietButton} disabled={busy} onClick={() => setAsking({ kind: "cancel" })}>
                Cancel group order
              </button>
            ) : null}
            {!group.youAreHost && active ? (
              <button type="button" data-opens="leave" className={quietButton} disabled={busy} onClick={() => setAsking({ kind: "leave" })}>
                Leave group order
              </button>
            ) : null}
          </div>
        )}
        <NoticeLine notice={notice} where="actions" />
      </section>
    </>,
  );
}

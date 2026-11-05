"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { getSession, loadSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { callAccountDeletion } from "@/features/account-deletion/api/account-deletion-api";
import { DeletionPage } from "@/features/account-deletion/components/deletion-page";
import { DeletionStart } from "@/features/account-deletion/components/deletion-start";
import { DeletionStateView } from "@/features/account-deletion/components/deletion-state-view";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import { entryStateFor } from "@/features/account-deletion/domain/deletion-model";
import type { DeletionScope, DeletionSide, DeletionView } from "@/features/account-deletion/domain/deletion-types";
import { useCustomerSignOut } from "@/features/profile/components/SignOutFlow";
import { refreshSessionCookies } from "@/shared/lib/session-fetch";
import { Skeleton } from "@/shared/ui/feedback/skeleton";

type Load = "loading" | "unavailable" | { latest: DeletionView | null };
type Notice = { text: string; alert: boolean };

/** What Keep my account says once it went through (the app's strip notice). */
function keptNotice(scope: DeletionScope, roles: readonly string[]): string {
  const { kept, kitchen, mealPlans } = deletionCopy.keep;
  const lines = scope === "CHEF" ? [kitchen] : scope === "ALL" && roles.includes("CHEF") ? [kitchen, mealPlans] : [mealPlans];
  return [kept, ...lines].join(" ");
}

/** /account/delete: the start flow when nothing is open, otherwise where the request stands, with Keep my account. */
export function DeleteAccountScreen({ side }: { side: DeletionSide }) {
  const router = useRouter();
  const signOut = useCustomerSignOut();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const roles = user?.roles ?? [];
  const [load, setLoad] = useState<Load>("loading");
  // The declined request the person chose to ask again after; a newer request shows its own state.
  const [askedAgainAfter, setAskedAgainAfter] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [keeping, setKeeping] = useState(false);
  // A ref: two clicks before React re-renders the button both still see keeping === false.
  const keepInFlight = useRef(false);

  const signIn = useCallback(() => {
    router.replace(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [router]);

  const lookAgain = useCallback(async () => {
    const answer = await callAccountDeletion("GET");
    if (answer.ok) setLoad({ latest: answer.view });
    else if (answer.code === "SESSION_EXPIRED") signIn();
    // Unknown is not "nothing open": someone with a request on record must never be offered a new one.
    else setLoad("unavailable");
  }, [signIn]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const known = getSession() ?? (await loadSession({ keepOnOutage: true }).catch(() => null));
      if (!live) return;
      if (known) await lookAgain();
      else signIn();
    })();
    return () => {
      live = false;
    };
  }, [lookAgain, signIn]);

  // POST and DELETE bump the sign-in's token version: renew it before showing the answer or asking anything else.
  const changed = useCallback(async (view: DeletionView | null) => {
    await refreshSessionCookies().catch(() => false);
    setNotice(null);
    setLoad({ latest: view });
  }, []);

  async function keep(view: DeletionView) {
    if (keepInFlight.current) return;
    keepInFlight.current = true;
    setKeeping(true);
    setNotice(null);
    try {
      const answer = await callAccountDeletion("DELETE");
      if (answer.ok) {
        await changed(answer.view);
        setNotice({ text: keptNotice(view.scope, roles), alert: false });
      } else if (answer.code === "NO_DELETION_REQUEST") {
        // The request had already ended: show what the server holds now.
        await lookAgain();
      } else if (answer.code === "ACCOUNT_DELETION_IN_PROGRESS") {
        setNotice({ text: deletionCopy.keep.inProgress, alert: true });
        await lookAgain();
      } else {
        setNotice({ text: deletionCopy.keep.failed, alert: true });
      }
    } finally {
      keepInFlight.current = false;
      setKeeping(false);
    }
  }

  const title = side === "chef" ? deletionCopy.chefSummary.titleAll : deletionCopy.customerSummary.title;
  const page = (children: ReactNode) => (
    <DeletionPage side={side} title={title} onSignOut={signOut.ask}>
      {children}
    </DeletionPage>
  );
  let content: ReactNode;
  if (load === "loading") {
    content = page(
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-24 rounded-[20px]" />
        <Skeleton className="h-40 rounded-[20px]" />
      </div>,
    );
  } else if (load === "unavailable") {
    content = page(<p className="text-base leading-6 text-[#6B6B6B]">{deletionCopy.web.unavailable}</p>);
  } else {
    const noticeView = notice ? (
      <p role={notice.alert ? "alert" : "status"} className={`rounded-xl p-3 text-sm font-medium ${notice.alert ? "bg-[#F1F3F5] text-[#C4200F]" : "bg-[#E8F5EC] text-[#0E7C3A]"}`}>
        {notice.text}
      </p>
    ) : null;
    const entry = entryStateFor(load.latest);
    content =
      entry.kind !== "start" && !(entry.kind === "declined" && entry.view.requestId === askedAgainAfter) ? (
        page(
          <DeletionStateView
            state={entry}
            roles={roles}
            keeping={keeping}
            notice={noticeView}
            onKeep={() => void keep(entry.view)}
            onAskAgain={() => {
              setNotice(null);
              setAskedAgainAfter(entry.view.requestId);
            }}
          />,
        )
      ) : (
        <DeletionStart side={side} roles={roles} notice={noticeView} onSent={changed} onLookAgain={lookAgain} onSignOut={signOut.ask} />
      );
  }
  // The dialog sits beside the page, so it stays open when the page changes step underneath it.
  return (
    <>
      {content}
      {signOut.dialog}
    </>
  );
}

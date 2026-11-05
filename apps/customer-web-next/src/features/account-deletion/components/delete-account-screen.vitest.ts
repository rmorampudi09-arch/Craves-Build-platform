// @vitest-environment jsdom
// /account/delete with disposable identities and stubbed /api answers; no backend is contacted.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "@/features/auth/api/cravesAuth";
import { DeleteAccountScreen } from "@/features/account-deletion/components/delete-account-screen";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import type { DeletionSide, DeletionView } from "@/features/account-deletion/domain/deletion-types";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/account/delete",
  useRouter: () => router,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

type CravesIdentity = Parameters<typeof setSessionIdentity>[0];
const person = (roles: string[]): CravesIdentity => ({ id: "71111111-1111-4111-8111-111111111111", phoneNumber: "+910000000007", displayName: "Asha Rao", email: null, emailVerified: false, status: "ACTIVE", roles });
const view = (over: Partial<DeletionView> = {}): DeletionView => ({ requestId: "r1", scope: "CHEF", status: "PENDING_REVIEW", requestedAt: "2026-11-05T06:00:00Z", dueAt: null, reviewNote: null, ...over });

type Answer = () => Response | Promise<Response>;
let me: CravesIdentity | null;
let answers: { GET: Answer; POST: Answer; DELETE: Answer; refresh: Answer };
const calls = (method: string, url = "/api/account-deletion") =>
  vi.mocked(fetch).mock.calls.filter(([input, init]) => String(input) === url && (init?.method ?? "GET") === method);

function signIn(roles: string[]) {
  me = person(roles);
  setSessionIdentity(me);
}
function open(side: DeletionSide, search = side ? `?side=${side}` : "") {
  window.history.replaceState(null, "", `/account/delete${search}`);
  return render(createElement(DeleteAccountScreen, { side }));
}
const red = (name: string) => screen.findByRole("button", { name });
async function confirmDialog(title: string) {
  return screen.findByRole("dialog", { name: title });
}

beforeEach(() => {
  me = null;
  router.replace.mockReset();
  router.push.mockReset();
  answers = {
    GET: () => Response.json({ none: true }),
    POST: () => Response.json(view()),
    DELETE: () => Response.json(view({ status: "CANCELLED" })),
    refresh: () => (me ? Response.json({ identity: me }) : Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 })),
  };
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "/api/auth/me") return me ? Response.json(me) : Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    if (url === "/api/auth/refresh") return answers.refresh();
    if (url === "/api/account-deletion") return answers[(init?.method ?? "GET") as "GET" | "POST" | "DELETE"]();
    return Response.json({}, { status: 404 });
  }));
});
afterEach(() => {
  cleanup();
  invalidateSession(captureSessionContext());
  vi.unstubAllGlobals();
});

describe("Delete account page", () => {
  it("sends a signed-out visitor to sign in and back, keeping ?side=chef", async () => {
    open("chef");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/sign-in?returnTo=${encodeURIComponent("/account/delete?side=chef")}`));
    expect(calls("GET")).toHaveLength(0);
  });

  it("skips the chooser for a customer-only account and shows the whole-account summary", async () => {
    signIn(["CUSTOMER"]);
    open("customer");
    expect(await screen.findByText("Referral credits you haven't used")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Delete account" })).toBeTruthy();
    expect(screen.getByText(deletionCopy.customerSummary.until[3])).toBeTruthy();
    // No chef side, so nothing says one stays.
    expect(screen.queryByText(deletionCopy.customerSummary.chefSideStays)).toBeNull();

    fireEvent.click(await red("Delete my account"));
    const dialog = await screen.findByRole("dialog", { name: /^Delete your account on \d{1,2} [A-Z][a-z]{2}\?$/ });
    expect(within(dialog).getByText(deletionCopy.confirm.customerAllBody)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls("POST")).toHaveLength(0);
  });

  it("offers a chef and customer three sides with nothing picked, and Continue waits for a pick", async () => {
    signIn(["CUSTOMER", "CHEF"]);
    open(null);
    expect(await screen.findByRole("heading", { level: 1, name: deletionCopy.chooser.title })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toEqual(["Only my customer side", "Only my chef side", "My whole account"].map((name) => screen.getByRole("radio", { name })));
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    const next = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Only my customer side/ }));
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    // The customer side's summary says the chef side stays, and its confirm says so too.
    expect(await screen.findByText(deletionCopy.customerSummary.chefSideStays)).toBeTruthy();
    fireEvent.click(await red("Delete my account"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(deletionCopy.confirm.customerSideBody)).toBeTruthy();
  });

  it("offers a chef on the chef side only the chef side or the whole account, and sends exactly the side picked", async () => {
    signIn(["CUSTOMER", "CHEF"]);
    answers.POST = () => Response.json(view({ scope: "CHEF" }), { status: 201 });
    open("chef");
    expect(await screen.findByRole("radio", { name: /Only my chef side/ })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /My whole account/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Only my chef side/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { level: 1, name: deletionCopy.chefSummary.titleSide })).toBeTruthy();
    expect(screen.getByText(deletionCopy.chefSummary.lastStepSide)).toBeTruthy();
    expect(screen.getByText(deletionCopy.chefSummary.customerSideStays)).toBeTruthy();
    fireEvent.click(await red("Send delete request"));
    const dialog = await confirmDialog(deletionCopy.confirm.chefTitle);
    expect(within(dialog).getByText(deletionCopy.confirm.chefSideBody)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close kitchen and send" }));

    expect(await screen.findByRole("heading", { name: deletionCopy.state.inReviewTitle })).toBeTruthy();
    expect(calls("POST")).toHaveLength(1);
    expect(calls("POST")[0][1]?.body).toBe(JSON.stringify({ scope: "CHEF" }));
  });

  it("sends only the customer side for a customer who is also a rider, without saying a chef side stays", async () => {
    signIn(["CUSTOMER", "RIDER"]);
    answers.POST = () => Response.json(view({ scope: "CUSTOMER" }), { status: 201 });
    open("customer");
    expect(await screen.findByText("Your customer profile")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(deletionCopy.customerSummary.chefSideStays)).toBeNull();
    fireEvent.click(await red("Delete my account"));
    const dialog = await screen.findByRole("dialog", { name: /^Delete your customer side on / });
    expect(within(dialog).getByText(deletionCopy.confirm.customerSideBodyNoChef)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    await screen.findByRole("heading", { name: deletionCopy.state.inReviewTitle });
    expect(calls("POST")[0][1]?.body).toBe(JSON.stringify({ scope: "CUSTOMER" }));
  });

  it("gives a chef-only account on the customer side one choice, the whole account", async () => {
    signIn(["CHEF"]);
    open("customer");
    expect(await screen.findByRole("radio", { name: /My whole account/ })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });

  it("sends one request when the red button is clicked twice", async () => {
    signIn(["CUSTOMER"]);
    open("customer");
    fireEvent.click(await red("Delete my account"));
    const send = within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete my account" });
    // Both clicks land before React re-renders the button as busy.
    act(() => {
      send.click();
      send.click();
    });
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    await screen.findByRole("heading", { name: deletionCopy.state.inReviewTitle });
    expect(calls("POST")).toHaveLength(1);
  });

  it("renews the session after the request is sent, before it shows the new state", async () => {
    signIn(["CUSTOMER"]);
    answers.POST = () => Response.json(view({ scope: "ALL", status: "SCHEDULED", dueAt: "2026-12-05T06:00:00Z" }), { status: 201 });
    let renew!: () => void;
    answers.refresh = () => new Promise((settle) => (renew = () => settle(Response.json({ identity: me }))));
    open("customer");
    fireEvent.click(await red("Delete my account"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(calls("POST", "/api/auth/refresh")).toHaveLength(1));
    expect(calls("POST")).toHaveLength(1);
    expect(screen.queryByText(deletionCopy.state.scheduledTag)).toBeNull();
    renew();
    expect(await screen.findByText(deletionCopy.state.scheduledTag)).toBeTruthy();
    expect(screen.getByText("Your account will be deleted on 5 Dec 2026")).toBeTruthy();
  });

  it.each([
    ["ACCOUNT_DELETION_NOT_ENABLED", 503, deletionCopy.sendErrors.notEnabled],
    ["ACCOUNT_DELETION_SCOPE_NOT_ALLOWED", 409, deletionCopy.sendErrors.scopeNotAllowed],
    ["INVALID_DELETION_SCOPE", 400, deletionCopy.sendErrors.failed],
  ])("says why a %s refusal was not sent, in the dialog", async (code, status, text) => {
    signIn(["CUSTOMER"]);
    answers.POST = () => Response.json({ code }, { status });
    open("customer");
    fireEvent.click(await red("Delete my account"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(text);
    expect(calls("POST", "/api/auth/refresh")).toHaveLength(0);
  });

  it("shows the open request when one was already made", async () => {
    signIn(["CUSTOMER"]);
    answers.POST = () => Response.json({ code: "ACCOUNT_DELETION_ALREADY_REQUESTED" }, { status: 409 });
    open("customer");
    fireEvent.click(await red("Delete my account"));
    answers.GET = () => Response.json(view({ scope: "ALL" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete my account" }));
    expect(await screen.findByRole("heading", { name: deletionCopy.state.inReviewTitle })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls("GET")).toHaveLength(2);
  });

  it("shows only the not-available note when the status call fails", async () => {
    signIn(["CUSTOMER", "CHEF"]);
    answers.GET = () => Response.json({ code: "ACCOUNT_DELETION_NOT_ENABLED" }, { status: 503 });
    open("chef");
    expect(await screen.findByText(deletionCopy.web.unavailable)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Sign out"]);
  });

  it("signs out from the page footer with the website's customer sign-out, a dialog that outlives the step", async () => {
    signIn(["CUSTOMER", "CHEF"]);
    let answer!: () => void;
    answers.GET = () => new Promise((settle) => (answer = () => settle(Response.json({ none: true }))));
    open(null);
    // Asked while the status still loads; the chooser then replaces the loading page underneath the dialog.
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("dialog", { name: "Sign out of Craves?" })).toBeTruthy();
    await waitFor(() => expect(calls("GET")).toHaveLength(1));
    answer();
    await waitFor(() => expect(document.querySelectorAll("input[type=radio]")).toHaveLength(3));
    expect(screen.getByRole("dialog", { name: "Sign out of Craves?" })).toBeTruthy();
  });

  it("shows a declined request with the reason, Ask again and Contact support by email", async () => {
    signIn(["CUSTOMER", "CHEF"]);
    answers.GET = () => Response.json(view({ status: "REJECTED", reviewNote: "Payout dispute open" }));
    open("chef");
    expect(await screen.findByText(deletionCopy.state.declinedTitle.CHEF)).toBeTruthy();
    expect(screen.getByText("Payout dispute open")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("mailto:support@craves.in");
    fireEvent.click(screen.getByRole("button", { name: "Ask again" }));
    expect(await screen.findByRole("radio", { name: /Only my chef side/ })).toBeTruthy();
  });

  it("keeps the account with one request however often Keep is clicked, renews, and shows the start again", async () => {
    signIn(["CUSTOMER", "CHEF"]);
    answers.GET = () => Response.json(view({ status: "SCHEDULED", dueAt: "2026-12-05T06:00:00Z" }));
    open("chef");
    const keep = await red("Keep my account");
    act(() => {
      keep.click();
      keep.click();
    });
    expect(await screen.findByRole("radio", { name: /Only my chef side/ })).toBeTruthy();
    expect(calls("DELETE")).toHaveLength(1);
    expect(calls("POST", "/api/auth/refresh")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(`${deletionCopy.keep.kept} ${deletionCopy.keep.kitchen}`);
  });

  it.each([
    ["ACCOUNT_DELETION_IN_PROGRESS", 409, deletionCopy.keep.inProgress],
    ["ACCOUNT_DELETION_FAILED", 503, deletionCopy.keep.failed],
  ])("says why Keep didn't go through on %s", async (code, status, text) => {
    signIn(["CUSTOMER"]);
    answers.GET = () => Response.json(view({ scope: "ALL", status: "WAITING_ON_OPEN_ITEMS" }));
    answers.DELETE = () => Response.json({ code }, { status });
    open("customer");
    fireEvent.click(await red("Keep my account"));
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(calls("POST", "/api/auth/refresh")).toHaveLength(0);
  });

  it("asks again when Keep finds no open request", async () => {
    signIn(["CUSTOMER"]);
    answers.GET = () => Response.json(view({ scope: "ALL", status: "SCHEDULED", dueAt: "2026-12-05T06:00:00Z" }));
    answers.DELETE = () => Response.json({ code: "NO_DELETION_REQUEST" }, { status: 404 });
    open("customer");
    const keep = await red("Keep my account");
    answers.GET = () => Response.json({ none: true });
    fireEvent.click(keep);
    expect(await screen.findByText("Referral credits you haven't used")).toBeTruthy();
    expect(calls("GET")).toHaveLength(2);
  });
});

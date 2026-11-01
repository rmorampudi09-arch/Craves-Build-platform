// @vitest-environment jsdom
// Synthetic codes; no backend is contacted.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefReferrals } from "./chef-referrals";

const invite = { code: "ABCDEFGH23456789", link: "https://craves.in/r/ABCDEFGH23456789" };
// What /api/referrals/me/chef-earnings sends (the parsed reply).
const earnings = {
  currency: "INR",
  creditedPaise: "45000",
  reversedPaise: "5000",
  netRecordedPaise: "40000",
  postingMonth: "2026-10",
  monthlyCapPaise: "150000",
  monthUsedPaise: "40000",
  monthRemainingPaise: "110000",
  monthlyCapReached: false,
  recentPostings: [
    {
      id: "11111111-2222-4333-8444-555555555555",
      amountPaise: "-5000",
      postingMonth: "2026-10",
      postedAt: "2026-10-14T03:30:00Z",
    },
  ],
};
// What /api/referrals/me sends: the overview cut down to the tiles.
const overview = {
  currency: "INR",
  pendingPaise: "15000",
  levels: [
    { level: 1, netEarnedPaise: "30000" },
    { level: 2, netEarnedPaise: "12000" },
    { level: 3, netEarnedPaise: "0" },
  ],
  downline: [
    { level: 1, members: "2" },
    { level: 2, members: "1" },
  ],
};
const unpublished = () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 });
const notJoined = () =>
  Response.json({ code: "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE" }, { status: 403 });
const routes = vi.fn<(path: string) => Response>();

beforeEach(() => {
  routes.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => routes(path)),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Refer a chef", () => {
  it("shows the invite, the earned tile and the credits for a member", async () => {
    // The overview isn't on the gateway yet: Joined and On hold say Coming soon, Earned comes from the earnings.
    routes.mockImplementation((path) =>
      path.endsWith("/code")
        ? Response.json(invite)
        : path === "/api/referrals/me"
          ? unpublished()
          : Response.json(earnings),
    );
    render(createElement(ChefReferrals));
    expect(await screen.findByText(invite.code)).toBeTruthy();
    // The Earned tile and this month's amount.
    expect(await screen.findAllByText("₹400.00")).toHaveLength(2);
    expect(screen.getByText("₹400.00 this month · limit ₹1,500.00")).toBeTruthy();
    expect(screen.getByText("Referral reversal")).toBeTruthy();
    expect(screen.getByText("−₹50.00")).toBeTruthy();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
  });

  it("shows Joined, On hold and Earned from the overview once it answers", async () => {
    routes.mockImplementation((path) =>
      path.endsWith("/code")
        ? Response.json(invite)
        : path === "/api/referrals/me"
          ? Response.json(overview)
          : Response.json(earnings),
    );
    render(createElement(ChefReferrals));
    const tile = async (label: string) =>
      (await screen.findByText(label)).nextElementSibling?.textContent;
    await screen.findByText("₹420.00");
    expect(await tile("Joined")).toBe("3");
    expect(await tile("On hold")).toBe("₹150.00");
    expect(await tile("Earned")).toBe("₹420.00");
    expect(screen.queryByText("Coming soon")).toBeNull();

    cleanup();
    routes.mockImplementation((path) =>
      path.endsWith("/code")
        ? Response.json(invite)
        : path === "/api/referrals/me"
          ? Response.json({ code: "REFERRAL_OVERVIEW_UNAVAILABLE" }, { status: 503 })
          : Response.json(earnings),
    );
    render(createElement(ChefReferrals));
    expect(await screen.findAllByText("—")).toHaveLength(3);
  });

  it("joins an older account, then waits for the invite link and checks again", async () => {
    routes.mockImplementation((path) =>
      path.endsWith("/enroll") ? Response.json({ accepted: true, status: "QUEUED" }) : notJoined(),
    );
    render(createElement(ChefReferrals));
    const join = await screen.findByRole("button", { name: "Join" });
    expect((join as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I accept the referral terms"));
    fireEvent.click(join);
    expect(await screen.findByText("Setting up your invite link…")).toBeTruthy();
    const body = vi
      .mocked(fetch)
      .mock.calls.find(([path]) => path === "/api/referrals/enroll")?.[1]?.body;
    expect(JSON.parse(String(body))).toEqual({
      termsVersion: "craves-chef-referral-terms-v1-2026-10-12",
      termsAccepted: true,
    });

    routes.mockImplementation((path) =>
      path.endsWith("/code") ? Response.json(invite) : Response.json(earnings),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText(invite.code)).toBeTruthy();
  });

  it("gives up polling after a minute and says to check later", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    routes.mockImplementation((path) =>
      path.endsWith("/enroll")
        ? Response.json({ accepted: true, status: "ALREADY_ENROLLED" })
        : notJoined(),
    );
    render(createElement(ChefReferrals));
    fireEvent.click(await screen.findByLabelText("I accept the referral terms"));
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await screen.findByText("Setting up your invite link…");
    const before = routes.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(routes.mock.calls.length - before).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(
      screen.getByText("Your invite link is still being set up. Check again in a few minutes."),
    ).toBeTruthy();
  });

  it("waits for a slow check instead of starting another", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    routes.mockImplementation((path) =>
      path.endsWith("/enroll") ? Response.json({ accepted: true, status: "QUEUED" }) : notJoined(),
    );
    render(createElement(ChefReferrals));
    fireEvent.click(await screen.findByLabelText("I accept the referral terms"));
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await screen.findByText("Setting up your invite link…");
    let answer: (reply: Response) => void = () => {};
    const slow = vi.fn(
      (path: string) =>
        new Promise<Response>((resolve) => {
          answer = resolve;
          if (!path.endsWith("/code")) resolve(Response.json(earnings));
        }),
    );
    vi.stubGlobal("fetch", slow);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(slow).toHaveBeenCalledTimes(1);
    answer(Response.json(invite));
    expect(await screen.findByText(invite.code)).toBeTruthy();
  });

  it("shows Coming soon when the routes are not published", async () => {
    routes.mockImplementation(unpublished);
    render(createElement(ChefReferrals));
    expect(await screen.findByText("Referrals are on their way")).toBeTruthy();
  });

  it("says joining is coming soon when enrolment is not published", async () => {
    routes.mockImplementation((path) =>
      path.endsWith("/enroll")
        ? Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })
        : notJoined(),
    );
    render(createElement(ChefReferrals));
    fireEvent.click(await screen.findByLabelText("I accept the referral terms"));
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByText("Joining is coming soon")).toBeTruthy();
  });
});

// @vitest-environment jsdom
// Synthetic codes; no backend is contacted.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefReferrals } from "./chef-referrals";

const invite = { code: "ABCDEFGH23456789", link: "https://craves.in/r/ABCDEFGH23456789" };
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
    routes.mockImplementation((path) =>
      path.endsWith("/code") ? Response.json(invite) : Response.json(earnings),
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

  it("shows Coming soon when the routes are not published", async () => {
    routes.mockImplementation(() =>
      Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
    );
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

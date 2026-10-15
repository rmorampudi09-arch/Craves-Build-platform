// @vitest-environment jsdom
// Disposable identity and responses; no production API is called.
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefAppHeader } from "../components/chef-app-header";
import { markChefModeVerified } from "./chef-mode";
import { captureSessionContext, invalidateSession, setSessionIdentity } from "../../auth/api/cravesAuth";
import { NOTICES_READ_EVENT } from "@/shared/lib/notice-events";

vi.mock("next/navigation", () => ({ usePathname: () => "/chef/orders", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const chef = { id: "61111111-1111-4111-8111-111111111111", phoneNumber: "+910000000002", displayName: "Asha Rao", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER", "CHEF"] };
const count = vi.hoisted(() => ({ response: () => Response.json({ unreadCount: 3 }) }));
const fetcher = vi.fn<typeof fetch>(async (input) => (String(input) === "/api/notifications/in-app/unread-count?role=CHEF" ? count.response() : Response.json({}, { status: 404 })));

beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
  setSessionIdentity(chef);
  markChefModeVerified(chef.id);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  invalidateSession(captureSessionContext());
});

describe("chef header bell", () => {
  it("shows the chef's unread count and reads it again after notices are read", async () => {
    render(createElement(ChefAppHeader));
    expect(await screen.findByRole("link", { name: "Notifications, 3 unread" })).toBeTruthy();
    count.response = () => Response.json({ unreadCount: 0 });
    act(() => {
      window.dispatchEvent(new Event(NOTICES_READ_EVENT));
    });
    expect(await screen.findByRole("link", { name: "Notifications" })).toBeTruthy();
  });

  it("shows no badge while the count route is not live", async () => {
    count.response = () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 });
    render(createElement(ChefAppHeader));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/notifications/in-app/unread-count?role=CHEF", expect.anything()));
    expect(screen.getByRole("link", { name: "Notifications" }).textContent).toBe("");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openLandingAuth } from "../landing-modal/entry";
import { clearSession, getSession } from "../../auth/api/cravesAuth";

const identity = {
  id: "d1111111-1111-4111-8111-111111111111",
  phoneNumber: "+919876543210", roles: ["CUSTOMER"], status: "ACTIVE",
};
const profile = {
  id: identity.id, registeredPhoneNumber: identity.phoneNumber,
  firstName: "Asha", lastName: "Rao", email: null,
  createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
const navigate = vi.fn();
let releaseProfile: (value: Response) => void;

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock.mockReset().mockResolvedValue(response({ signedOut: true })));
  await clearSession();
  sessionStorage.clear();
  fetchMock.mockClear();
  navigate.mockClear();
  const browser = window;
  vi.stubGlobal("window", new Proxy(browser, {
    get: (target, key) => key === "location" ? { assign: navigate } : Reflect.get(target, key, target),
  }));
  document.body.innerHTML = '<div id="root">Landing</div>';
});

afterEach(async () => {
  releaseProfile?.(response(profile));
  await Promise.resolve();
  fetchMock.mockResolvedValue(response({ signedOut: true }));
  await clearSession();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it.each([false, true])("hands off a verified returning session while profile is pending (refresh required: %s)", async (expired) => {
  let meCalls = 0;
  const pendingProfile = new Promise<Response>((resolve) => { releaseProfile = resolve; });
  fetchMock.mockImplementation((url) => {
    if (url === "/api/auth/me") {
      meCalls += 1;
      return Promise.resolve(expired && meCalls === 1
        ? response({ code: "AUTHENTICATION_REQUIRED" }, 401) : response(identity));
    }
    if (url === "/api/auth/refresh") return Promise.resolve(response({ identity }));
    if (url === "/api/customer/profile") return pendingProfile;
    throw new Error("Unexpected request: " + url);
  });

  await openLandingAuth();
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/home");
  expect(document.getElementById("craves-customer-auth")).toBeNull();
  expect(getSession()?.id).toBe(identity.id);
  expect(getSession()?.firstName).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expired
    ? ["/api/auth/me", "/api/auth/refresh", "/api/auth/me", "/api/customer/profile"]
    : ["/api/auth/me", "/api/customer/profile"]);
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/otp/"))).toBe(false);
  releaseProfile(response(profile));
  await vi.waitFor(() => expect(getSession()?.firstName).toBe("Asha"));
});

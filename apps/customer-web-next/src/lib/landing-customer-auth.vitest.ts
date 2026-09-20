// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { openLandingAuth } from "../landing-auth/entry";

const mocks = vi.hoisted(() => ({ load: vi.fn(), send: vi.fn() }));
vi.mock("firebase/auth", () => ({ RecaptchaVerifier: class {}, signInWithPhoneNumber: mocks.send }));
vi.mock("./firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));
vi.mock("../services/auth/cravesAuth", async (original) => ({ ...(await original<object>()), loadSession: mocks.load }));

beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(null); mocks.send.mockReset();
  document.body.innerHTML = '<div id="root"><button id="trigger">Sign up / Sign in</button><div id="page-content">Landing</div></div>';
  document.getElementById('trigger')!.focus();
});
afterEach(async () => {
  const close = screen.queryByRole('button', { name: 'Close sign-in dialog' });
  if (close) await act(async () => fireEvent.click(close));
  document.body.innerHTML = '';
});
it('opens the original customer popup and switches through both registration roles without sending codes', async () => {
  await act(async () => openLandingAuth());
  expect(screen.getByRole('dialog', { name: 'Customer sign in' })).toBeTruthy();
  expect(document.getElementById('root')!.inert).toBe(true);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(screen.getByRole('button', { name: 'Create a customer account' }));
  expect(screen.getByRole('dialog', { name: 'Create your customer account' })).toBeTruthy();
  expect((screen.getByLabelText(/Email/) as HTMLInputElement).required).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: /Home Chef\s*Cook and grow/ }));
  expect(screen.getByRole('dialog', { name: 'Join Craves as a Home Chef' })).toBeTruthy();
  expect((screen.getByLabelText(/Email/) as HTMLInputElement).required).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByRole('dialog', { name: 'Home Chef sign in' })).toBeTruthy();
  expect(mocks.send).not.toHaveBeenCalled();
});
it('deduplicates clicks and restores scrolling and trigger focus on close, then reopens cleanly', async () => {
  await act(async () => Promise.all([openLandingAuth(), openLandingAuth()]));
  expect(mocks.load).toHaveBeenCalledOnce();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: '0000000000' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Close sign-in dialog' })));
  expect(document.getElementById('craves-customer-auth')).toBeNull();
  expect(document.getElementById('root')!.inert).toBe(false);
  expect(document.body.style.overflow).toBe('');
  expect(document.activeElement).toBe(document.getElementById('trigger'));
  await act(async () => openLandingAuth());
  expect((screen.getByLabelText(/Mobile number/) as HTMLInputElement).value).toBe('');
});
it('does not leave the page locked after a session lookup fails and allows retry', async () => {
  mocks.load.mockRejectedValueOnce(new Error('offline'));
  await expect(openLandingAuth()).rejects.toThrow('offline');
  expect(document.getElementById('craves-customer-auth')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  await act(async () => openLandingAuth());
  expect(screen.getByRole('dialog', { name: 'Customer sign in' })).toBeTruthy();
});

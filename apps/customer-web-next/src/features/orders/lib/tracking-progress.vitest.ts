// @vitest-environment jsdom
// Synthetic owned order; no network or customer mutations.
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TrackingPage from '../screens/OrderTracking';

const fixture = vi.hoisted(() => ({ id: '11111111-2222-4333-8444-555555555555', navigate: vi.fn(), session: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => fixture.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement('a', { href: to }, children),
}));
vi.mock('../../auth/api/cravesAuth', () => ({ loadSession: () => fixture.session() }));
vi.mock('../components/TrackingHeader', () => ({
  TrackingHeader: ({ onBack, backLabel }: { onBack: () => void; backLabel: string }) =>
    createElement('header', null, createElement('button', { type: 'button', onClick: onBack }, backLabel)),
}));
// No WebGL here: the map is a labelled box that keeps its overlays.
vi.mock('../components/OrderMap', async (original) => ({
  ...(await original<typeof import('../components/OrderMap')>()),
  OrderMap: ({ label, children }: { label: string; children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'order-map', 'data-label': label }, children),
}));

beforeEach(() => { fixture.session.mockResolvedValue({ identityId: fixture.id }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const order = (status: string) => ({ id: fixture.id, checkoutId: fixture.id, kitchenId: fixture.id, kitchenName: 'Fixture kitchen',
  status, currency: 'INR', foodSubtotal: 100, platformFee: 0, taxAmount: 0, deliveryFee: 0,
  grandTotal: 100, chefResponseNote: null, prepTimeMinutes: 20, deliveryAddress: null, items: [],
  createdAt: '2026-09-16T10:00:00Z', updatedAt: '2026-09-16T10:05:00Z' });
const emptyDelivery = { orderId: fixture.id, deliveryJobId: null, providerId: null, status: null, trackingUrl: null, observedAt: null, history: [] };
function serve(orderBody: unknown, deliveryBody: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/delivery-status') ? deliveryBody : orderBody),
    { status: 200, headers: { 'Content-Type': 'application/json' } })));
}

it('renders ready-for-pickup as the headline for a valid empty delivery projection', async () => {
  serve(order('READY_FOR_PICKUP'), emptyDelivery);
  render(createElement(TrackingPage, { orderId: fixture.id }));
  expect(await screen.findByRole('heading', { name: 'Ready for pickup' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Delivery code' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Waiting for delivery updates' })).toBeNull();
  expect(screen.getByText('Total')).toBeTruthy();
  expect(screen.queryByText('Backend total')).toBeNull();
  // Opened from the order's details, so back returns there, like the app.
  fireEvent.click(screen.getByRole('button', { name: 'Back to order details' }));
  expect(fixture.navigate).toHaveBeenCalledWith({ to: `/orders/${fixture.id}` });
});

it('shows the delivery code while a Craves rider carries the order', async () => {
  serve(order('OUT_FOR_DELIVERY'), { ...emptyDelivery, providerId: 'craves_fleet', status: 'IN_TRANSIT', deliveryCode: '4719' });
  render(createElement(TrackingPage, { orderId: fixture.id }));
  expect(await screen.findByRole('heading', { name: 'Delivery code' })).toBeTruthy();
  expect(screen.getByRole('img', { name: '4 7 1 9' }).textContent).toBe('4719');
  expect(screen.getByText('Tell this code to your Craves rider at the door. Craves never asks for it on a call.')).toBeTruthy();
});

it('keeps a customer whose sign-in could not be checked on the page, with Try again', async () => {
  fixture.session.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  serve(order('PREPARING'), emptyDelivery);
  render(createElement(TrackingPage, { orderId: fixture.id }));
  expect(await screen.findByRole('heading', { name: 'We couldn’t sign you back in' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe(`/sign-in?returnTo=${encodeURIComponent(`/orders/${fixture.id}/tracking`)}`);
  expect(fixture.navigate).not.toHaveBeenCalledWith({ to: '/' });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  // The day sheet's heading matches the order page's.
  expect(await screen.findByRole('heading', { name: 'Preparing your food' })).toBeTruthy();
});

it('draws a failed load in its own words and tries again', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'ORDER_UNAVAILABLE', message: 'pool exhausted' }), { status: 503 })));
  render(createElement(TrackingPage, { orderId: fixture.id }));
  expect(await screen.findByRole('heading', { name: 'Tracking didn’t load' })).toBeTruthy();
  expect(screen.getByTestId('empty-illustration-loadError')).toBeTruthy();
  expect(screen.queryByText(/pool exhausted/)).toBeNull();
  expect(screen.getByRole('link', { name: 'My Orders' }).getAttribute('href')).toBe('/orders');
});

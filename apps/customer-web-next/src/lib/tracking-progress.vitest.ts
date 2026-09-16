// @vitest-environment jsdom
// Synthetic owned order; no network or customer mutations.
import { createElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TrackingPage from '../screens/OrderTracking/OrderTracking';

const fixture = vi.hoisted(() => ({ id: '11111111-2222-4333-8444-555555555555', navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => ({ id: fixture.id }) }),
  useNavigate: () => fixture.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement('a', { href: to }, children),
}));
vi.mock('../services/auth/cravesAuth', () => ({ loadSession: async () => ({ identityId: fixture.id }) }));
vi.mock('../components/tracking/TrackingHeader', () => ({ TrackingHeader: () => createElement('header', null, 'Track order') }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('renders ready-for-pickup as the headline for a valid empty delivery projection', async () => {
  const order = { id: fixture.id, checkoutId: fixture.id, kitchenId: fixture.id, kitchenName: 'Fixture kitchen',
    status: 'READY_FOR_PICKUP', currency: 'INR', foodSubtotal: 100, platformFee: 0, taxAmount: 0, deliveryFee: 0,
    grandTotal: 100, chefResponseNote: null, prepTimeMinutes: 20, deliveryAddress: null, items: [],
    createdAt: '2026-09-16T10:00:00Z', updatedAt: '2026-09-16T10:05:00Z' };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/delivery-status')
    ? { orderId: fixture.id, deliveryJobId: null, providerId: null, status: null, trackingUrl: null, observedAt: null, history: [] }
    : order), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  render(createElement(TrackingPage));
  expect(await screen.findByRole('heading', { name: 'Ready For Pickup' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Waiting for delivery updates' })).toBeNull();
  expect(screen.getByText('Total')).toBeTruthy();
  expect(screen.queryByText('Backend total')).toBeNull();
});

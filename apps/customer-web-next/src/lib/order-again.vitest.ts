import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerOrder } from "../features/orders/lib/order-contract";

const cart = vi.hoisted(() => ({ addToCart: vi.fn(async () => undefined), loadCart: vi.fn(async () => []) }));
const menu = vi.hoisted(() => ({ loadKitchenMenu: vi.fn() }));
vi.mock("@/features/cart/api/cravesCart", () => ({ addToCart: cart.addToCart, loadCart: cart.loadCart, CartKeptError: class extends Error {} }));
vi.mock("@/features/dish/api/dishes", () => ({ loadKitchenMenu: menu.loadKitchenMenu }));

import { reorderIntoCart } from "@/features/orders/screens/OrderHistory";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const PANEER = "22222222-2222-4222-8222-222222222222";
const ROTI = "33333333-3333-4333-8333-333333333333";
const DAL = "44444444-4444-4444-8444-444444444444";
const order = {
  kitchenId: KITCHEN,
  items: [
    { menuItemId: PANEER, itemName: "Paneer butter masala", quantity: 2 },
    { menuItemId: ROTI, itemName: "Butter roti", quantity: 60 },
    { menuItemId: DAL, itemName: "Dal tadka", quantity: 1 },
  ],
} as CustomerOrder;
const dish = (id: string, name: string) => ({ id, name, chef: "Fixture kitchen", price: 120, img: "/dish.jpg" });

beforeEach(() => {
  cart.addToCart.mockClear();
  cart.loadCart.mockClear();
  menu.loadKitchenMenu.mockReset();
});

describe("order again", () => {
  it("adds what's still on the menu through the cart and names what isn't", async () => {
    menu.loadKitchenMenu.mockResolvedValue([dish(PANEER, "Paneer butter masala"), dish(ROTI, "Butter roti")]);
    const result = await reorderIntoCart(order);

    expect(menu.loadKitchenMenu).toHaveBeenCalledWith(KITCHEN);
    // Starts from the cart Craves holds now (a paid order may have used the one on screen).
    expect(cart.loadCart).toHaveBeenCalledTimes(1);
    expect(cart.addToCart.mock.calls).toEqual([
      [expect.objectContaining({ id: PANEER, kitchenId: KITCHEN }), 2],
      [expect.objectContaining({ id: ROTI, kitchenId: KITCHEN }), 50],
    ]);
    expect(result).toEqual({ added: 2, note: "Dal tadka isn’t available right now, so we added the rest of your order." });
  });

  it("adds nothing when the kitchen no longer serves any of the dishes", async () => {
    menu.loadKitchenMenu.mockResolvedValue([]);
    expect((await reorderIntoCart(order)).added).toBe(0);
    expect(cart.addToCart).not.toHaveBeenCalled();
  });
});

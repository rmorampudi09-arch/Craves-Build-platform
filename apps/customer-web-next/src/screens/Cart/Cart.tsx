import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSession } from "@/services/auth/cravesAuth";
import {
  getCart,
  loadCart,
  setQty,
  removeFromCart,
  subscribeCart,
  cartTotal,
  type CartItem,
} from "@/services/api/cravesCart";
import { CartHeader } from "@/components/cart/CartHeader";
import { EmptyCartState } from "@/components/cart/EmptyCartState";
import { CartItemList } from "@/components/cart/CartItemList";
import { BillSummaryCard } from "@/components/cart/BillSummaryCard";
import { CartCheckoutBar } from "@/components/cart/CartCheckoutBar";

// Route metadata (head tags, etc.) consumed by src/routes/cart.tsx
export const routeMeta = {
  head: () => ({
    meta: [{ title: "Your Cart – Craves" }, { name: "robots", content: "noindex" }],
  }),
};

/**
 * Cart screen. Composed of named pieces from src/components/cart/ —
 * this file just owns the cart state and the bill-total math.
 */
function CartPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    void loadSession().then((session) => {
    if (!session) {
      navigate({ to: "/" });
      return;
    }
    const refresh = () => setItems([...getCart()]);
    void loadCart().then(refresh);
    });
    return subscribeCart(() => setItems([...getCart()]));
  }, [navigate]);

  const subtotal = cartTotal();

  return (
    <div className="min-h-screen bg-cream pb-32">
      <CartHeader onBack={() => navigate({ to: "/home" })} />
      <main className="mx-auto max-w-4xl px-4 pt-6">
        {items.length === 0 ? (
          <EmptyCartState onBrowseMenu={() => navigate({ to: "/home" })} />
        ) : (
          <>
            <CartItemList items={items} onRemove={removeFromCart} onSetQty={setQty} />
            <BillSummaryCard subtotal={subtotal} currency={items[0]?.currency} />
          </>
        )}
      </main>
      {items.length > 0 && (
        <CartCheckoutBar total={subtotal} onContinue={() => navigate({ to: "/payment" })} />
      )}
    </div>
  );
}

export default CartPage;

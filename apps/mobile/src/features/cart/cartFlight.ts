/** Where an added dish's photo starts its flight to the floating cart button, in window coordinates. */
export interface CartFlight {
  imageUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

type CartFlightListener = (flight: CartFlight) => void;

const listeners = new Set<CartFlightListener>();

/** A dish card calls this once its add has landed in the cart. */
export function launchCartFlight(flight: CartFlight) {
  listeners.forEach(listener => listener(flight));
}

/** The bottom menu listens so the photo can fly into the cart button wherever it sits. */
export function subscribeCartFlight(listener: CartFlightListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

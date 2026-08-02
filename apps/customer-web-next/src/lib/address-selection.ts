import type { CustomerAddress } from "@/lib/address-contract";

export function selectActiveDeliveryAddress(
  addresses: readonly CustomerAddress[],
): CustomerAddress | null {
  return addresses.find((address) => address.active && address.isDefault)
    ?? addresses.find((address) => address.active)
    ?? null;
}

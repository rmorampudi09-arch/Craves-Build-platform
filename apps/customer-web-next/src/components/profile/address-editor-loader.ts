import type { ComponentProps, ComponentType } from "react";

export type AddressEditorProps = ComponentProps<typeof import("./AddressEditorFlow").AddressEditorFlow>;
export type AddressEditor = ComponentType<AddressEditorProps>;
let ready: AddressEditor | null = null;
let pending: Promise<AddressEditor> | null = null;

export function loadAddressEditor(): Promise<AddressEditor> {
  if (ready) return Promise.resolve(ready);
  if (!pending) {
    pending = import("./AddressEditorFlow")
      .then((module) => { ready = module.AddressEditorFlow; return ready; })
      .catch((error: unknown) => { pending = null; throw error; });
  }
  return pending;
}

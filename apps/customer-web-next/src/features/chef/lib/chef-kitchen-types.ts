export type KitchenStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type EditableKitchenStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
export type ChefKitchenSocialLinks = { instagram: string | null; facebook: string | null; youtube: string | null; website: string | null };

export type ChefKitchen = {
  id: string;
  kitchenName: string;
  displayName: string | null;
  description: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: KitchenStatus;
  createdAt: string;
  updatedAt: string;
  // Undefined until the server sends them: a screen shows each one only when it is there.
  chefPhotoUrl?: string | null;
  kitchenPhotoUrl?: string | null;
  /** The filled kitchen photo slots in order (slot 1 is kitchenPhotoUrl). */
  kitchenPhotoUrls?: string[];
  cuisines?: string[];
  serviceAreas?: string[];
  socialLinks?: ChefKitchenSocialLinks;
};

export type ChefKitchenInput = {
  kitchenName: string;
  displayName: string | null;
  description: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EditableKitchenStatus;
  /** Left out keeps what the server has; socialLinks replaces all four links. */
  cuisines?: string[];
  serviceAreas?: string[];
  socialLinks?: ChefKitchenSocialLinks;
};

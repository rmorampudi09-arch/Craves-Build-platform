export type AuthRole = 'CUSTOMER' | 'CHEF';
export type IdentityStatus = 'ACTIVE' | 'SUSPENDED';
export type IdentityRole = 'CUSTOMER' | 'CHEF' | 'ADMIN';

export interface Identity {
  id: string;
  firebaseUid: string;
  phoneNumber: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  status: IdentityStatus;
  roles: IdentityRole[];
  lastLoginAt: string | null;
}

export interface AuthTokenResponse {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  identity: Identity;
}

export interface ApiErrorResponse {
  code?: string;
  message?: string;
  timestamp?: string;
}

export type ChefApplicationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type CustomerOnboardingStatus = 'PROFILE_REQUIRED' | 'READY';
export type ChefOnboardingStatus = Exclude<ChefApplicationStatus, 'APPROVED'>;

/**
 * P21 authoritative account result. `requestedRole` remains user intent only.
 * `authorizedRole` is derived from backend identity roles and must be the source
 * for any eventual Customer/Chef product-root authorization decision.
 */
export type AccountResolution =
  | {
      flow: 'CUSTOMER';
      requestedRole: 'CUSTOMER';
      authorizedRole: 'CUSTOMER';
      onboardingStatus: CustomerOnboardingStatus;
    }
  | {
      flow: 'CHEF_ONBOARDING';
      requestedRole: 'CHEF';
      authorizedRole: 'CUSTOMER';
      onboardingStatus: ChefOnboardingStatus;
    }
  | {
      flow: 'CHEF';
      requestedRole: 'CHEF';
      authorizedRole: 'CHEF';
      onboardingStatus: 'APPROVED';
    };

export interface KycDocument {
  id: string;
  documentType: 'AADHAAR_CARD' | 'PAN_CARD';
  originalFileName: string;
  blobContainer: string;
  blobName: string;
  contentType: string;
  fileSizeBytes: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChefApplication {
  id: string | null;
  identityId: string;
  phoneNumber: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ChefApplicationStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByIdentityId: string | null;
  documents: KycDocument[];
}

export interface CustomerProfile {
  id: string;
  identityId: string;
  registeredPhoneNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

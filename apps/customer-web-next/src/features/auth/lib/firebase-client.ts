"use client";

// Moved to src/shared so profile and chef settings can reach Firebase too; existing imports keep working.
export { getFirebaseBrowserClient, type FirebaseBrowserClient } from "@/shared/lib/firebase-client";

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";

type FirebaseClient = {
  app: FirebaseApp;
  auth: Auth;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Create apps/firebase-auth-test/.env.local from .env.example.`);
  }
  return value;
}

export function getFirebaseClient(): FirebaseClient {
  const firebaseConfig = {
    apiKey: requiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    appId: requiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  };

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return {
    app,
    auth: getAuth(app)
  };
}

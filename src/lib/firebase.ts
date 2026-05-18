import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Connectivity Check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error: any) {
    if (error.message?.includes("the client is offline")) {
      console.error("Please check your Firebase configuration or connectivity.");
    }
  }
}
testConnection();

export interface FirestoreErrorInfo {
  error: string;
  operationType: "create" | "update" | "delete" | "list" | "get" | "write";
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string }[];
  };
}

export function handleFirestoreError(error: any, operation: FirestoreErrorInfo["operationType"], path: string | null = null) {
  const user = auth.currentUser;
  const errorInfo: FirestoreErrorInfo = {
    error: error.message || "Unknown Firestore error",
    operationType: operation,
    path,
    authInfo: {
      userId: user?.uid || "unauthenticated",
      email: user?.email || "",
      emailVerified: user?.emailVerified || false,
      isAnonymous: user?.isAnonymous || false,
      providerInfo: user?.providerData.map(p => ({
        providerId: p.providerId,
        displayName: p.displayName || "",
        email: p.email || ""
      })) || []
    }
  };
  throw new Error(JSON.stringify(errorInfo));
}

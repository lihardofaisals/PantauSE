import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, setDoc, doc, serverTimestamp } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
console.log("Config loaded, Project:", config.projectId, "DB ID:", config.firestoreDatabaseId);
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);

async function checkAndSeed() {
  console.log("Signing in anonymously...");
  await signInAnonymously(auth);
  console.log("Authenticated as:", auth.currentUser?.uid);
  
  console.log("Checking for admin user...");
  const snap = await getDocs(collection(db, "users"));
  console.log(`Current users: ${snap.size}`);
  
  if (snap.size === 0) {
    console.log("No users found. Seeding admin account...");
    await setDoc(doc(db, "users", "seed_admin_0"), {
      name: "Admin Asahan",
      username: "admin_asahan",
      password: "admin123",
      role: "admin",
      district: "BPS Asahan",
      desa: "-",
      subSls: "",
      phoneNumber: "628000000000",
      mustChangePassword: false,
      createdAt: serverTimestamp(),
      lastLogin: null
    });
    console.log("Admin account seeded successfully!");
  } else {
    console.log("Users already exist.");
  }
  process.exit(0);
}

checkAndSeed().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

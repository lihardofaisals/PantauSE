import { db } from "../lib/firebase";
import { collection, doc, setDoc, getDocs, serverTimestamp, writeBatch, query, limit } from "firebase/firestore";

// Realistic data for Kabupaten Asahan
const KECAMATAN = [
  "Kisaran Timur", "Kisaran Barat", "Meranti", "Rawang Panca Arga",
  "Pulo Bandring", "Simpang Empat", "Teluk Dalam", "Tanjung Balai",
  "Air Joman", "Sei Dadap", "Bandar Pulau", "Aek Kuasan",
  "Kota Kisaran Timur", "Kota Kisaran Barat", "Air Batu",
  "Sei Kepayang", "Tinggi Raja", "Setia Janji", "Silau Laut",
  "Buntu Pane", "Bp Mandoge", "Rahuning", "Sei Kepayang Barat",
  "Sei Kepayang Timur", "Aek Songsongan"
];

const NAMA_PPL = [
  "Ahmad Fauzi", "Siti Aisyah", "Budi Santoso", "Dewi Lestari",
  "Rudi Hartono", "Fitri Handayani", "Eko Prasetyo", "Nurul Hidayah",
  "Agus Setiawan", "Rina Wulandari", "Dian Permata", "Heri Susanto",
  "Maya Sari", "Bambang Wibowo", "Lina Marlina", "Joko Widodo",
  "Sri Wahyuni", "Andi Pratama", "Yuni Astuti", "Rahmat Hidayat",
  "Putri Maharani", "Wahyu Nugroho", "Sari Indah", "Toni Gunawan",
  "Ratna Dewi"
];

const DESA_PER_KEC: Record<string, string[]> = {
  "Kisaran Timur": ["Mutiara", "Sentang", "Sei Renggas", "Teladan"],
  "Kisaran Barat": ["Sidodadi", "Mekar Baru", "Bunut", "Tebing Kisaran"],
  "Meranti": ["Meranti", "Suka Makmur", "Sumber Harapan"],
  "Rawang Panca Arga": ["Rawang Baru", "Panca Arga", "Buntu Maraja"],
  "Pulo Bandring": ["Pulo Bandring", "Sidomulyo", "Bangun Sari"],
  "Simpang Empat": ["Simpang Empat", "Perkebunan Hessa", "Manis"],
};

export interface SeedResult {
  users: number;
  sls: number;
  reports: number;
}

export async function seedDemoData(): Promise<SeedResult> {
  let usersCreated = 0;
  let slsCreated = 0;
  let reportsCreated = 0;

  // 1. Seed Users (PPL)
  for (let i = 0; i < NAMA_PPL.length; i++) {
    const kec = KECAMATAN[i % KECAMATAN.length];
    const desas = DESA_PER_KEC[kec] || ["Desa " + (i + 1)];
    const desa = desas[i % desas.length];
    const phone = `62899${String(10000000 + i).padStart(8, '0')}`;
    const username = `ppl_${kec.toLowerCase().replace(/\s+/g, '_').substring(0, 10)}_${String(i + 1).padStart(2, '0')}`;

    await setDoc(doc(db, "users", `seed_ppl_${i}`), {
      name: NAMA_PPL[i],
      username: username,
      password: `se2026_${String(i + 1).padStart(3, '0')}`,
      role: "ppl",
      district: kec,
      desa: desa,
      subSls: "",
      phoneNumber: phone,
      mustChangePassword: true,
      createdAt: serverTimestamp(),
      lastLogin: null
    });
    usersCreated++;
  }

  // 1b. Seed Admin Account
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
  usersCreated++;

  // 2. Seed SLS Data (for heatmap)
  const slsEntries: Array<{ id: string; kec: string; desa: string; name: string }> = [];
  
  for (let kecIdx = 0; kecIdx < KECAMATAN.length; kecIdx++) {
    const kec = KECAMATAN[kecIdx];
    const kecCode = String(kecIdx + 1).padStart(3, '0');
    const desas = DESA_PER_KEC[kec] || [`Desa ${kecIdx + 1}A`, `Desa ${kecIdx + 1}B`];
    
    for (let desaIdx = 0; desaIdx < desas.length; desaIdx++) {
      const desaCode = String(desaIdx + 1).padStart(3, '0');
      const slsCount = 2 + Math.floor(Math.random() * 3); // 2-4 SLS per desa
      
      for (let slsIdx = 0; slsIdx < slsCount; slsIdx++) {
        const slsCode = String(slsIdx + 1).padStart(4, '0');
        const idsls = `1208${kecCode}${desaCode}${slsCode}`;
        const target = 80 + Math.floor(Math.random() * 120); // 80-200
        const progress = Math.random();
        const realisasi = progress < 0.2 
          ? Math.floor(target * Math.random() * 0.3) // 20% chance: kritis
          : progress < 0.5 
            ? Math.floor(target * (0.5 + Math.random() * 0.4)) // 30% chance: proses
            : Math.floor(target * (0.9 + Math.random() * 0.15)); // 50% chance: hampir tuntas

        await setDoc(doc(db, "sls", idsls), {
          idsubsls: idsls,
          idsls: idsls,
          nmsls: `${kec} - ${desas[desaIdx]} - SLS ${slsCode}`,
          nmdesa: desas[desaIdx],
          nmkec: kec,
          target: target,
          realisasi: Math.min(realisasi, target + 10),
          lastUpdate: serverTimestamp()
        });
        
        slsEntries.push({ id: idsls, kec, desa: desas[desaIdx], name: `SLS ${slsCode}` });
        slsCreated++;
      }
    }
  }

  // 3. Seed Reports (recent activity)
  const today = new Date();
  for (let i = 0; i < 15; i++) {
    const pplIdx = Math.floor(Math.random() * NAMA_PPL.length);
    const slsEntry = slsEntries[Math.floor(Math.random() * slsEntries.length)];
    const entryCount = 5 + Math.floor(Math.random() * 80);
    const reportDate = new Date(today.getTime() - Math.random() * 3 * 24 * 60 * 60 * 1000); // last 3 days

    const username = `ppl_${KECAMATAN[pplIdx % KECAMATAN.length].toLowerCase().replace(/\s+/g, '_').substring(0, 10)}_${String(pplIdx + 1).padStart(2, '0')}`;

    await setDoc(doc(db, "reports", `seed_report_${i}`), {
      userId: username,
      userName: NAMA_PPL[pplIdx],
      authorId: username,
      idsls: slsEntry.id,
      entryCount: entryCount,
      district: slsEntry.kec,
      desa: slsEntry.desa,
      reportDate: reportDate.toISOString().split("T")[0],
      status: entryCount > 60 ? "pending" : "verified",
      createdAt: serverTimestamp(),
      timestamp: serverTimestamp()
    });
    reportsCreated++;
  }

  return { users: usersCreated, sls: slsCreated, reports: reportsCreated };
}

export async function clearDemoData(): Promise<void> {
  const collections = ["users", "sls", "reports", "notifications"];
  
  for (const colName of collections) {
    const snap = await getDocs(collection(db, colName));
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      // Only delete seeded data or everything if desired. 
      // For demo, we delete everything in these collections to ensure a clean slate.
      batch.delete(d.ref);
    });
    await batch.commit();
  }
}

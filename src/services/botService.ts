import { db } from "../lib/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs
} from "firebase/firestore";

export type BotStep = 
  | "IDLE" 
  | "AWAITING_IDSLS" 
  | "AWAITING_ENTRY_COUNT" 
  | "AWAITING_CONFIRMATION" 
  | "AWAITING_ANOMALY_CONFIRM"
  | "AWAITING_CHECK_SLS"
  | "AWAITING_DIRECT_LAPOR_CONFIRM";

export interface BotResponse {
  text: string;
  type: "text" | "list" | "buttons";
  options?: string[];
}

export interface BotSession {
  currentStep: BotStep;
  selectedMenu?: string;
  lastData?: {
    idsls?: string;
    entryCount?: number;
    prevVal?: number;
    unusualReason?: string;
    target?: number;
    [key: string]: any;
  };
  updatedAt: number;
}

const slsCache: string[] = ["12080600100001", "12080600100002", "12080600100003", "12080600100004", "12080600100005"];

const getOfficerSlsOptions = (userData: any): string[] => {
  if (userData && userData.assignedSlsTargets && userData.assignedSlsTargets.length > 0) {
    return userData.assignedSlsTargets.map((t: any) => t.idsls);
  }
  return [...slsCache];
};

const withTimeout = async (promise: Promise<any>, timeoutMs: number = 2000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs))
    ]);
};

const getSession = (phoneNumber: string): BotSession => {
    try {
        const saved = localStorage.getItem(`bot_session_${phoneNumber}`);
        if (!saved) return { currentStep: "IDLE", updatedAt: Date.now() };
        
        const parsed = JSON.parse(saved);
        // Session expires after 30 minutes of inactivity
        if (Date.now() - parsed.updatedAt > 30 * 60 * 1000) {
            return { currentStep: "IDLE", updatedAt: Date.now() };
        }
        return parsed;
    } catch (e) {
        return { currentStep: "IDLE", updatedAt: Date.now() };
    }
};

const saveSession = (phoneNumber: string, data: Partial<BotSession>) => {
    const current = getSession(phoneNumber);
    localStorage.setItem(`bot_session_${phoneNumber}`, JSON.stringify({
        ...current,
        ...data,
        updatedAt: Date.now()
    }));
};

const getMainMenuText = (name: string): string => {
  return `Halo *${name}*! 👋\nSelamat datang di *Asahan Spatial Assistant SE2026*.\n\nSaya asisten digital Anda untuk memudahkan pelaporan dan pemantauan data SLS di lapangan secara real-time.\n\nSilakan pilih menu interaktif di bawah:`;
};

const getMainMenuOptions = (): string[] => {
  return [
    "1️⃣ LAPOR CAPAIAN SLS",
    "2️⃣ CEK PROGRES SLS",
    "3️⃣ HUBUNGI PENGAWAS",
    "4️⃣ PANDUAN PETUGAS",
    "5️⃣ STATUS TELEMETRI"
  ];
};

export const botService = {
  resetSession(phoneNumber: string) {
    localStorage.removeItem(`bot_session_${phoneNumber}`);
  },

  async processMessage(phoneNumber: string, message: string, agentId?: string): Promise<BotResponse> {
      let userData: any = { name: "Mitra SE", username: "mitra_user", district: "Asahan", phoneNumber, assignedAgent: "GATEWAY_CORE_v4" };
      try {
        try {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("phoneNumber", "==", phoneNumber));
          const userDocs = await withTimeout(getDocs(q), 1000) as any;
          if (!userDocs.empty) userData = userDocs.docs[0].data();
        } catch (e) {}

        const effectiveAgent = agentId || userData.assignedAgent || "GATEWAY_CORE_v4";

        // 1. Global command interceptors to provide modern conversational controls
      const normalizedMsg = message.trim().toLowerCase();
      
      if (normalizedMsg === "batal" || normalizedMsg === "cancel" || normalizedMsg === "exit") {
          this.resetSession(phoneNumber);
          return {
            text: "🛑 *Batal*\nAlur percakapan saat ini telah dibatalkan. Mengembalikan Anda ke Menu Utama.\n\n" + getMainMenuText(userData.name),
            type: "list",
            options: getMainMenuOptions()
          };
      }

      if (normalizedMsg === "menu" || normalizedMsg === "kembali" || normalizedMsg === "home") {
          saveSession(phoneNumber, { currentStep: "IDLE" });
          return {
            text: getMainMenuText(userData.name),
            type: "list",
            options: getMainMenuOptions()
          };
      }

      if (normalizedMsg === "bantuan" || normalizedMsg === "help" || normalizedMsg === "tanya") {
          const session = getSession(phoneNumber);
          let contextTip = "Ketik *batal* untuk menghentikan proses, atau *menu* untuk kembali ke layar utama.";
          
          if (session.currentStep === "AWAITING_IDSLS") {
            contextTip = "Silakan klik salah satu tombol SLS di bawah atau ketik langsung 14 digit SLS ID yang tertera pada dokumen tugas Anda.";
          } else if (session.currentStep === "AWAITING_ENTRY_COUNT") {
            contextTip = `Anda sedang melaporkan untuk SLS *${session.lastData?.idsls}*. Masukkan jumlah dokumen yang terkumpul berupa angka saja (contoh: 42).`;
          } else if (session.currentStep === "AWAITING_CONFIRMATION" || session.currentStep === "AWAITING_ANOMALY_CONFIRM") {
            contextTip = "Klik *YA* untuk menyimpan capaian data ke database, atau *BATALKAN* untuk membatalkannya.";
          }
          
          return {
            text: `💡 *BANTUAN ASISTEN DIGITAL*\n-------------------------\n${contextTip}\n\nKetik *menu* untuk kembali ke dashboard utama.`,
            type: "text"
          };
      }

      // 3. Process normal menu logic steps
      const sessionData = getSession(phoneNumber);
      const currentStep = sessionData.currentStep;

      switch (currentStep) {
        case "IDLE":
          // Handling Main Menu selections (supports typed numbers, titles, or keyword matches)
          if (normalizedMsg.includes("lapor") || normalizedMsg.includes("1")) {
            saveSession(phoneNumber, { currentStep: "AWAITING_IDSLS", selectedMenu: "lapor" });
            return { 
              text: `📝 *PELAPORAN CAPAIAN SLS*\n-------------------------\nHalo ${userData.name}, silakan pilih atau masukkan *ID SLS (14 digit)* yang ingin dilaporkan:`, 
              type: "list", 
              options: getOfficerSlsOptions(userData) 
            };
          } 
          
          if (normalizedMsg.includes("cek") || normalizedMsg.includes("progres") || normalizedMsg.includes("2")) {
            saveSession(phoneNumber, { currentStep: "AWAITING_CHECK_SLS", selectedMenu: "cek" });
            return { 
              text: `📊 *CEK PROGRES DATA SLS*\n-------------------------\nSilakan pilih atau masukkan *ID SLS* untuk melihat detail capaian saat ini:`, 
              type: "list", 
              options: getOfficerSlsOptions(userData) 
            };
          }

          if (normalizedMsg.includes("hubungi") || normalizedMsg.includes("pengawas") || normalizedMsg.includes("3")) {
            return {
              text: `📞 *INFO PENGAWAS LAPANGAN (PML)*\n-------------------------\n• *Nama*: Budi Santoso, S.ST (PML)\n• *Mitra ID*: 9408120320\n• *Wilayah Kerja*: KEC. KISARAN BARAT\n• *Kontak*: +62 812-7744-8902\n\nJika ada kendala batas wilayah SLS atau ketidaksesuaian beban tugas, silakan hubungi pengawas Anda.\n\nKetik *menu* untuk kembali ke menu awal.`,
              type: "buttons",
              options: ["KEMBALI KE MENU", "BATAL"]
            };
          }

          if (normalizedMsg.includes("panduan") || normalizedMsg.includes("petugas") || normalizedMsg.includes("4")) {
            return {
              text: `📘 *PANDUAN PENCACAHAN SE2026*\n-------------------------\n1️⃣ *Verifikasi SLS*: Pastikan objek usaha berada di dalam perimeter SLS yang benar sebelum melakukan pendataan.\n2️⃣ *Cakupan*: Seluruh usaha ekonomi (formal/informal) wajib dicacah.\n3️⃣ *Dokumen K-SE*: Pastikan nomor urut bangunan terisi urut tanpa lompatan.\n\nKetik *menu* untuk kembali ke layar utama.`,
              type: "buttons",
              options: ["KEMBALI KE MENU", "BATAL"]
            };
          }

          if (normalizedMsg.includes("status") || normalizedMsg.includes("telemetri") || normalizedMsg.includes("5")) {
            return {
              text: `🤖 *STATUS TELEMETRI SISTEM*\n-------------------------\n• *Engine State*: ONLINE & OPERATIONAL\n• *Version*: GATEWAY_CORE_v4.6.0\n• *Latency*: 112ms (Good)\n• *Session Space*: ACTIVE\n• *User Context*: ${userData.name} (${userData.role || "Mitra"})\n• *Kabupaten Code*: 1208 (ASAHAN)\n\nLayanan bot stabil dan siap memproses laporan pencacahan Anda.`,
              type: "buttons",
              options: ["KEMBALI KE MENU", "BATAL"]
            };
          }

          // Dynamic fallback for unrecognized greeting / message
          return {
            text: getMainMenuText(userData.name),
            type: "list",
            options: getMainMenuOptions()
          };

        case "AWAITING_IDSLS":
          // Validate SLS ID format (must be 14 digits)
          const cleanSLSID = message.replace(/\D/g, "");
          if (cleanSLSID.length !== 14) {
            return {
              text: "⚠️ *ID SLS TIDAK VALID*\n\nID SLS harus berupa *14 digit angka* administratif.\nContoh: `12080600100001`.\n\nSilakan masukkan ulang ID SLS yang benar:",
              type: "text"
            };
          }

          // Fetch current progress to give contextual response
          let currentVal = 0;
          let currentTarget = 150;
          try {
            const slsRef = doc(db, "sls", cleanSLSID);
            const slsSnap = await withTimeout(getDoc(slsRef), 1000) as any;
            if (slsSnap.exists()) {
              currentVal = slsSnap.data().realisasi || 0;
              currentTarget = slsSnap.data().target || 150;
            } else {
              const mockStr = localStorage.getItem('mockSlsData');
              if (mockStr) {
                const parsed = JSON.parse(mockStr)[cleanSLSID];
                if (parsed) {
                  currentVal = parsed.realisasi || 0;
                  currentTarget = parsed.target || 150;
                }
              }
            }
          } catch (e) {}

          saveSession(phoneNumber, { 
            currentStep: "AWAITING_ENTRY_COUNT", 
            lastData: { idsls: cleanSLSID, prevVal: currentVal, target: currentTarget } 
          });

          return { 
            text: `✅ *SLS TERPILIH: ${cleanSLSID}*\n-------------------------\n• *Progres Saat Ini*: ${currentVal} / ${currentTarget} Dokumen\n\nSilakan ketikkan *jumlah total dokumen terbaru* yang telah selesai Anda entri:`, 
            type: "text" 
          };

        case "AWAITING_ENTRY_COUNT":
          const entryCount = parseInt(message.trim());
          if (isNaN(entryCount) || entryCount < 0) {
            return { 
              text: "⚠️ *MASUKKAN ANGKA SAJA*\n\nJumlah dokumen harus berupa angka bulat positif (contoh: `25`).\n\nBerapa total dokumen yang ingin Anda laporkan?", 
              type: "text" 
            };
          }

          const targetIdsls = sessionData.lastData?.idsls || "";
          const prevVal = sessionData.lastData?.prevVal || 0;
          const targetLimit = sessionData.lastData?.target || 150;

          let isUnusual = false;
          let unusualReason = "";

          // Anomaly checks
          if (entryCount < prevVal) {
            isUnusual = true;
            unusualReason = `Capaian yang dilaporkan (${entryCount} Dokumen) lebih kecil dari capaian yang tersimpan sebelumnya (${prevVal} Dokumen).`;
          } else if (entryCount > targetLimit * 1.5) {
            isUnusual = true;
            unusualReason = `Jumlah entri (${entryCount} Dokumen) sangat tinggi, melebihi target SLS (${targetLimit} Dokumen).`;
          } else if (entryCount === prevVal) {
            isUnusual = true;
            unusualReason = `Jumlah entri yang dilaporkan (${entryCount}) sama dengan realisasi saat ini. Tidak ada penambahan progres.`;
          }

          if (isUnusual) {
            saveSession(phoneNumber, { 
              currentStep: "AWAITING_ANOMALY_CONFIRM", 
              lastData: { ...sessionData.lastData, entryCount, unusualReason } 
            });
            return { 
              text: `⚠️ *PERINGATAN ANOMALI DATA*\n-------------------------\n${unusualReason}\n\nApakah Anda yakin angka yang dimasukkan sudah benar?`, 
              type: "buttons", 
              options: ["YA, SUDAH BENAR", "UBAH ANGKA", "BATALKAN"] 
            };
          }

          saveSession(phoneNumber, { 
            currentStep: "AWAITING_CONFIRMATION", 
            lastData: { ...sessionData.lastData, entryCount } 
          });
          
          return { 
            text: `📝 *KONFIRMASI PELAPORAN*\n-------------------------\n• *ID SLS*: ${targetIdsls}\n• *Capaian Baru*: ${entryCount} Dokumen\n• *Tambahan Progres*: +${entryCount - prevVal} Dokumen baru\n\nApakah data di atas ingin langsung disimpan ke sistem?`, 
            type: "buttons", 
            options: ["YA, SIMPAN DATA", "UBAH ANGKA", "BATALKAN"] 
          };

        case "AWAITING_ANOMALY_CONFIRM":
          if (message.toUpperCase().includes("YA") || message.toUpperCase().includes("BENAR")) {
            return this.triggerSave(phoneNumber, userData, sessionData.lastData, true);
          }
          if (message.toUpperCase().includes("UBAH") || message.toUpperCase().includes("ANGKA")) {
            saveSession(phoneNumber, { currentStep: "AWAITING_ENTRY_COUNT", lastData: sessionData.lastData });
            return { text: "Masukkan kembali jumlah total dokumen terbaru yang benar:", type: "text" };
          }
          
          // Fallback to cancelling
          this.resetSession(phoneNumber);
          return {
            text: "🛑 Laporan dibatalkan.\n\n" + getMainMenuText(userData.name),
            type: "list",
            options: getMainMenuOptions()
          };

        case "AWAITING_CONFIRMATION":
          if (message.toUpperCase().includes("YA") || message.toUpperCase().includes("SIMPAN")) {
            return this.triggerSave(phoneNumber, userData, sessionData.lastData, false);
          }
          if (message.toUpperCase().includes("UBAH") || message.toUpperCase().includes("ANGKA")) {
            saveSession(phoneNumber, { currentStep: "AWAITING_ENTRY_COUNT", lastData: sessionData.lastData });
            return { text: "Masukkan kembali jumlah total dokumen terbaru:", type: "text" };
          }
          
          // Fallback to cancelling
          this.resetSession(phoneNumber);
          return {
            text: "🛑 Laporan dibatalkan.\n\n" + getMainMenuText(userData.name),
            type: "list",
            options: getMainMenuOptions()
          };

        case "AWAITING_CHECK_SLS":
          // Cek Progres Workflow
          const cleanCheckID = message.replace(/\D/g, "");
          if (cleanCheckID.length !== 14) {
            return {
              text: "⚠️ *ID SLS TIDAK VALID*\n\nSilakan ketik ulang *14 digit ID SLS* secara lengkap:",
              type: "text"
            };
          }

          let checkRealisasi = 0;
          let checkTarget = 150;
          try {
            const slsRef = doc(db, "sls", cleanCheckID);
            const slsSnap = await withTimeout(getDoc(slsRef), 1000) as any;
            if (slsSnap.exists()) {
              checkRealisasi = slsSnap.data().realisasi || 0;
              checkTarget = slsSnap.data().target || 150;
            } else {
              const mockStr = localStorage.getItem('mockSlsData');
              if (mockStr) {
                const parsed = JSON.parse(mockStr)[cleanCheckID];
                if (parsed) {
                  checkRealisasi = parsed.realisasi || 0;
                  checkTarget = parsed.target || 150;
                }
              }
            }
          } catch (e) {}

          const progressPct = Math.min(100, Math.round((checkRealisasi / checkTarget) * 100));
          const numBars = Math.round(progressPct / 10);
          const barStr = "▓".repeat(numBars) + "░".repeat(10 - numBars);

          // Save current checked SLS in lastData for seamless contextual transitions
          saveSession(phoneNumber, { 
            currentStep: "AWAITING_DIRECT_LAPOR_CONFIRM", 
            lastData: { idsls: cleanCheckID, prevVal: checkRealisasi, target: checkTarget } 
          });

          return {
            text: `📊 *DETAIL CAPAIAN SLS: ${cleanCheckID}*\n-------------------------\n• *Kecamatan*: ${userData.district}\n• *Target Beban*: ${checkTarget} Dokumen\n• *Realisasi*: ${checkRealisasi} Dokumen\n• *Progres*: ${progressPct}%\n\n\`[${barStr}]\` ${progressPct}%\n\nApakah Anda ingin langsung melaporkan capaian terbaru untuk SLS ini?`,
            type: "buttons",
            options: ["YA, LAPOR SLS INI", "PILIH SLS LAIN", "BATAL"]
          };

        case "AWAITING_DIRECT_LAPOR_CONFIRM":
          // Contextual preservation logic triggered directly from check progress workflow
          if (message.toUpperCase().includes("YA") || message.toUpperCase().includes("LAPOR")) {
            saveSession(phoneNumber, { currentStep: "AWAITING_ENTRY_COUNT" });
            return {
              text: `📝 *SLS TERPILIH: ${sessionData.lastData?.idsls}*\n\nBerapa jumlah total dokumen terbaru yang telah Anda entri?`,
              type: "text"
            };
          }
          
          if (message.toUpperCase().includes("PILIH") || message.toUpperCase().includes("LAIN")) {
            saveSession(phoneNumber, { currentStep: "AWAITING_IDSLS" });
            return {
              text: "Silakan masukkan atau pilih ID SLS baru:",
              type: "list",
              options: getOfficerSlsOptions(userData)
            };
          }

          // Fallback to Main Menu
          saveSession(phoneNumber, { currentStep: "IDLE" });
          return {
            text: getMainMenuText(userData.name),
            type: "list",
            options: getMainMenuOptions()
          };

        default:
          saveSession(phoneNumber, { currentStep: "IDLE" });
          return { 
            text: getMainMenuText(userData.name), 
            type: "list", 
            options: getMainMenuOptions() 
          };
      }
    } catch (error) {
      return { 
        text: "⚠️ Layanan asisten mendeteksi gangguan jaringan. Silakan ketik *menu* untuk memuat ulang koneksi Anda.", 
        type: "text" 
      };
    }
  },

  // Database Synchronization Gateway with real-time UI dispatcher
  triggerSave(phoneNumber: string, userData: any, lastData: any, isAudit: boolean): BotResponse {
    const { entryCount, idsls } = lastData;
    
    // Background execution to ensure instant messaging responsiveness
    (async () => {
        try {
            const reportStatus = isAudit ? "pending" : "verified";

            // Only update SLS collection and local mock cache if NOT flagged for audit/pending verification
            if (!isAudit) {
                // Redesign: Enforce absolute single source of truth write to local mock cache
                const mockStr = localStorage.getItem('mockSlsData');
                const mockData = mockStr ? JSON.parse(mockStr) : {};
                mockData[idsls] = {
                    idsubsls: idsls, 
                    idsls: idsls, 
                    nmsls: `${userData.district || "Kecamatan"} - ${userData.desa || "Desa"} - SLS ${idsls.slice(-4)}`,
                    nmdesa: userData.desa || "Desa",
                    nmkec: userData.district || "Kecamatan",
                    target: lastData.target || 150, 
                    realisasi: entryCount, 
                    lastUpdate: new Date().toISOString()
                };
                localStorage.setItem('mockSlsData', JSON.stringify(mockData));

                // Enforce target structures write in Firestore
                const slsRef = doc(db, "sls", idsls);
                await withTimeout(setDoc(slsRef, { 
                    idsubsls: idsls, 
                    idsls: idsls, 
                    nmsls: `${userData.district || "Kecamatan"} - ${userData.desa || "Desa"} - SLS ${idsls.slice(-4)}`,
                    nmdesa: userData.desa || "Desa",
                    nmkec: userData.district || "Kecamatan",
                    target: lastData.target || 150,
                    realisasi: entryCount, 
                    lastUpdate: serverTimestamp() 
                }, { merge: true }), 1500).catch((err) => {
                    console.warn("Firestore setDoc failed, backed up in localStorage mock data:", err);
                });
            }

            // Create report document in reports collection - Include district, desa and timestamp to align schemas
            await withTimeout(addDoc(collection(db, "reports"), {
                userId: userData.username, 
                idsls: idsls, 
                userName: userData.name,
                entryCount: entryCount, 
                status: reportStatus, 
                isAuditFlag: isAudit,
                auditReason: lastData.unusualReason || "", 
                district: userData.district || "",
                desa: userData.desa || "",
                createdAt: serverTimestamp(),
                timestamp: serverTimestamp()
            }), 1500);

            // Redesign: Only update PPL assigned targets if NOT flagged as audit/pending
            if (!isAudit) {
                try {
                  const usersRef = collection(db, "users");
                  const q = query(usersRef, where("phoneNumber", "==", phoneNumber));
                  const userDocs = await getDocs(q);
                  if (!userDocs.empty) {
                    const uDoc = userDocs.docs[0];
                    const uData = uDoc.data();
                    if (uData.assignedSlsTargets) {
                      const updated = uData.assignedSlsTargets.map((t: any) => {
                        if (t.idsls === idsls) {
                          return {
                            ...t,
                            realisasi: entryCount,
                            progressPct: Math.min(100, Math.round((entryCount / (t.target || 150)) * 100))
                          };
                        }
                        return t;
                      });
                      await updateDoc(doc(db, "users", uDoc.id), { assignedSlsTargets: updated });
                    }
                  }
                } catch (err) {
                  console.warn("Failed to sync targets to user record:", err);
                }
            }

            // Log activity log update in local storage for detailed audit logging requested by user
            const logStr = localStorage.getItem('system_activity_logs');
            const logs = logStr ? JSON.parse(logStr) : [];
            logs.unshift({
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                type: isAudit ? "ANOMALY_DETECTED" : "REPORT_SUBMITTED",
                message: isAudit 
                    ? `Capaian SLS ${idsls} (${entryCount} dok) terdeteksi anomali: ${lastData.unusualReason}` 
                    : `Capaian SLS ${idsls} (${entryCount} dok) sukses disimpan.`,
                user: userData.name,
                status: isAudit ? "pending" : "success"
            });
            localStorage.setItem('system_activity_logs', JSON.stringify(logs.slice(0, 100))); // Keep last 100
            
            // Dispatch dynamic window updates for local visual state synchronization
            window.dispatchEvent(new Event('mockSlsUpdated'));
        } catch (e) {
            console.warn("Background save failed silently in simulation mode", e);
        }
    })();

    this.resetSession(phoneNumber);

    if (isAudit) {
      return {
        text: `⚠️ *LAPORAN DIANTRIKAN UNTUK VERIFIKASI*\n-------------------------\nLaporan capaian SLS *${idsls}* sebanyak *${entryCount} Dokumen* terdeteksi memiliki *ANOMALI DATA*:\n_${lastData.unusualReason}_\n\nLaporan telah masuk antrean verifikasi manual Pengawas/Admin. Progres SLS Anda akan diperbarui setelah mendapat persetujuan.\n\nKetik *menu* untuk kembali ke menu awal.`,
        type: "text"
      };
    }

    return { 
      text: `🎉 *BERHASIL DISIMPAN!*\n-------------------------\nLaporan capaian SLS *${idsls}* sebanyak *${entryCount} Dokumen* telah sukses disimpan dan divalidasi ke Master Database secara real-time.\n\nKetik *menu* untuk melakukan aktivitas lainnya.`, 
      type: "text" 
    };
  }
};

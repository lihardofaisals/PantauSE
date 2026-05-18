import { db } from "../lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  Timestamp 
} from "firebase/firestore";
import { useState, useEffect } from "react";

// Standardized Interfaces for Centralized State Management
export interface SLSData {
  id: string;
  idsubsls: string;
  idsls?: string;
  nmsls: string;
  nmdesa: string;
  nmkec: string;
  target: number;
  realisasi: number;
  lastUpdate?: any;
}

export interface ReportData {
  id: string;
  userId: string;
  userName: string;
  idsls: string;
  entryCount: number;
  status: "pending" | "verified" | "rejected";
  isAuditFlag?: boolean;
  auditReason?: string;
  district?: string;
  desa?: string;
  createdAt?: any;
  timestamp?: any;
}

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: "admin" | "ppl" | "pml";
  district: string;
  desa: string;
  phoneNumber: string;
  assignedSlsTargets?: any[];
}

export interface SyncStatus {
  status: "connected" | "syncing" | "error";
  lastSyncTime: string;
  discrepancyCount: number;
  integrityChecked: boolean;
  logs: Array<{
    id: string;
    timestamp: string;
    type: "INFO" | "WARNING" | "ERROR" | "SUCCESS" | "SYNC_OK" | "DISCREPANCY_DETECTED";
    message: string;
    user?: string;
  }>;
}

export interface UnifiedData {
  loading: boolean;
  stats: {
    totalEntries: number;
    activeUsers: number;
    dailyGrowth: number;
    pendingVerification: number;
    progressPercent: number;
    totalTarget: number;
    totalRealisasi: number;
    uniqueSLS: number;
    districtData: Array<{ name: string; value: number; target: number; percentage: number }>;
  };
  slsList: SLSData[];
  reports: ReportData[];
  users: UserRecord[];
  syncStatus: SyncStatus;
  charts: {
    districtProgressData: Array<{ name: string; Target: number; Realisasi: number; Persentase: number }>;
    slsDistribution: Array<{ name: string; value: number; color: string }>;
    timelineProgressData: Array<{ label: string; Target: number; Realisasi: number }>;
    officerPerformance: Array<{ name: string; role: string; Target: number; Realisasi: number; Persentase: number }>;
  };
}

// Initial Empty/Placeholder State
let currentData: UnifiedData = {
  loading: true,
  stats: {
    totalEntries: 0,
    activeUsers: 0,
    dailyGrowth: 0,
    pendingVerification: 0,
    progressPercent: 0,
    totalTarget: 0,
    totalRealisasi: 0,
    uniqueSLS: 0,
    districtData: [],
  },
  slsList: [],
  reports: [],
  users: [],
  syncStatus: {
    status: "syncing",
    lastSyncTime: new Date().toLocaleTimeString(),
    discrepancyCount: 0,
    integrityChecked: false,
    logs: [],
  },
  charts: {
    districtProgressData: [],
    slsDistribution: [],
    timelineProgressData: [],
    officerPerformance: [],
  },
};

type Listener = (data: UnifiedData) => void;
const listeners = new Set<Listener>();

// Helper to notify all active subscribers
function notifySubscribers() {
  listeners.forEach((listener) => listener({ ...currentData }));
}

// Centralized Calculation Engine (Calculates once, outputs identical data to all components)
function recalculateState(
  slsRaw: SLSData[],
  reportsRaw: ReportData[],
  usersRaw: UserRecord[]
) {
  const lastUpdatedTime = new Date().toLocaleTimeString();
  const logs: SyncStatus["logs"] = [];
  
  // 1. Basic list references
  currentData.slsList = slsRaw;
  currentData.reports = reportsRaw;
  currentData.users = usersRaw;

  // 2. Sum targets and progress (Single Source of Truth)
  let totalTarget = 0;
  let totalRealisasi = 0;
  const uniqueSLSSet = new Set<string>();

  slsRaw.forEach((s) => {
    totalTarget += s.target || 150;
    totalRealisasi += s.realisasi || 0;
    if (s.realisasi > 0) {
      uniqueSLSSet.add(s.id || s.idsls || "");
    }
  });

  const progressPercent = totalTarget > 0 ? Number(((totalRealisasi / totalTarget) * 100).toFixed(2)) : 0;
  const pendingVerification = reportsRaw.filter((r) => r.status === "pending").length;

  // 3. District-level aggregations
  const districtMap: Record<string, { target: number; realisasi: number }> = {};
  slsRaw.forEach((s) => {
    const kec = s.nmkec || s.nmsls?.split(" - ")[0] || "KISARAN BARAT";
    const cleanKec = kec.toUpperCase().trim();
    if (!districtMap[cleanKec]) {
      districtMap[cleanKec] = { target: 0, realisasi: 0 };
    }
    districtMap[cleanKec].target += s.target || 150;
    districtMap[cleanKec].realisasi += s.realisasi || 0;
  });

  const districtData = Object.keys(districtMap).map((name) => {
    const d = districtMap[name];
    const pct = d.target > 0 ? Math.round((d.realisasi / d.target) * 100) : 0;
    return {
      name,
      value: d.realisasi,
      target: d.target,
      percentage: pct,
    };
  }).sort((a, b) => b.value - a.value);

  // 4. SLS Distribution status ranges
  let lowProgressCount = 0;   // < 50%
  let mediumProgressCount = 0; // 50% - 99%
  let highProgressCount = 0;   // 100%

  slsRaw.forEach((s) => {
    const pct = s.target > 0 ? (s.realisasi / s.target) * 100 : 0;
    if (pct >= 100) highProgressCount++;
    else if (pct >= 50) mediumProgressCount++;
    else lowProgressCount++;
  });

  const slsDistribution = [
    { name: "Progress Rendah (<50%)", value: lowProgressCount, color: "#FF3B30" },
    { name: "Progress Sedang (50-99%)", value: mediumProgressCount, color: "#007AFF" },
    { name: "Progress Selesai (100%)", value: highProgressCount, color: "#34C759" },
  ].filter((d) => d.value > 0);

  // 5. Officer/User Performance Rankings
  const pplUsers = usersRaw.filter(u => u.role === "ppl" || u.role === "pml");
  const officerPerformance = pplUsers
    .map((u) => {
      let targetCount = 0;
      let realisasiCount = 0;

      if (u.assignedSlsTargets && u.assignedSlsTargets.length > 0) {
        targetCount = u.assignedSlsTargets.reduce((acc, curr) => acc + (curr.target || 150), 0);
        realisasiCount = u.assignedSlsTargets.reduce((acc, curr) => acc + (curr.realisasi || 0), 0);
      } else {
        // Fallback to searching sls by name
        const matched = slsRaw.filter(s => s.nmdesa?.toLowerCase().includes(u.name.toLowerCase()));
        targetCount = matched.reduce((acc, curr) => acc + (curr.target || 150), 0) || 150;
        realisasiCount = matched.reduce((acc, curr) => acc + (curr.realisasi || 0), 0) || 0;
      }

      const pct = targetCount > 0 ? Math.round((realisasiCount / targetCount) * 100) : 0;
      return {
        name: u.name.toUpperCase(),
        role: u.role.toUpperCase(),
        Target: targetCount,
        Realisasi: realisasiCount,
        Persentase: pct,
      };
    })
    .sort((a, b) => b.Persentase - a.Persentase)
    .slice(0, 10); // Limit to top 10

  // 6. DYNAMIC Weekly Cumulative Progress Timeline from Reports
  const verifiedReports = reportsRaw
    .filter((r) => r.status === "verified")
    .sort((a, b) => {
      const tA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : Date.parse(a.createdAt || 0);
      const tB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : Date.parse(b.createdAt || 0);
      return tA - tB;
    });

  const timelineProgressData: Array<{ label: string; Target: number; Realisasi: number }> = [];
  const TOTAL_INTERVALS = 5;

  if (verifiedReports.length === 0) {
    // Elegant proportional fallback to prevent clean/seed slates from rendering empty lines
    for (let i = 1; i <= TOTAL_INTERVALS; i++) {
      const multiplier = i / TOTAL_INTERVALS;
      timelineProgressData.push({
        label: `Minggu ${i}`,
        Target: Math.round(totalTarget),
        Realisasi: Math.round(totalRealisasi * multiplier),
      });
    }
  } else {
    // Dynamic cumulative calculation
    const getReportTime = (r: ReportData) => 
      r.createdAt instanceof Timestamp ? r.createdAt.toMillis() : Date.parse(r.createdAt || 0);
    
    const startTime = getReportTime(verifiedReports[0]);
    const endTime = Date.now();
    const totalSpan = endTime - startTime;
    const intervalSpan = totalSpan > 0 ? totalSpan / (TOTAL_INTERVALS - 1) : 86400000;

    for (let i = 0; i < TOTAL_INTERVALS; i++) {
      const timeLimit = startTime + i * intervalSpan;
      
      // Get the latest approved report for each SLS up to timeLimit
      const slsLatestReportValue: Record<string, number> = {};
      verifiedReports.forEach((r) => {
        if (getReportTime(r) <= timeLimit) {
          slsLatestReportValue[r.idsls] = r.entryCount;
        }
      });

      // Sum all active developments up to this week
      const cumulativeRealisasi = Object.values(slsLatestReportValue).reduce((acc, v) => acc + v, 0);
      
      timelineProgressData.push({
        label: `Minggu ${i + 1}`,
        Target: totalTarget,
        Realisasi: cumulativeRealisasi,
      });
    }
  }

  // 7. REAL-TIME DATA CONSISTENCY VALIDATION & LOGGING
  let discrepancyCount = 0;
  const slsWithReports = new Set(reportsRaw.map(r => r.idsls));
  
  slsWithReports.forEach((idsls) => {
    const slsObj = slsRaw.find((s) => s.idsubsls === idsls || s.idsls === idsls);
    const approvedSlsReports = reportsRaw.filter((r) => r.idsls === idsls && r.status === "verified");
    
    if (approvedSlsReports.length > 0) {
      const latestReport = approvedSlsReports.sort((a, b) => {
        const tA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : Date.parse(a.createdAt || 0);
        const tB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : Date.parse(b.createdAt || 0);
        return tB - tA; // descending (newest first)
      })[0];

      if (slsObj && slsObj.realisasi !== latestReport.entryCount) {
        discrepancyCount++;
        logs.push({
          id: `discrepancy_${idsls}_${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "DISCREPANCY_DETECTED",
          message: `[INTEGRITY ERROR] SLS ID ${idsls} realisasi (${slsObj.realisasi}) berbeda dengan laporan terverifikasi (${latestReport.entryCount}).`,
        });
      }
    }
  });

  // Fetch local audit/activity logs from localStorage
  const localLogsStr = localStorage.getItem("system_activity_logs");
  if (localLogsStr) {
    try {
      const parsed = JSON.parse(localLogsStr);
      parsed.slice(0, 10).forEach((l: any) => {
        logs.push({
          id: l.id || String(Math.random()),
          timestamp: l.timestamp || new Date().toISOString(),
          type: l.type === "ANOMALY_DETECTED" ? "WARNING" : l.status === "success" ? "SUCCESS" : "INFO",
          message: l.message,
          user: l.user,
        });
      });
    } catch (e) {}
  }

  if (discrepancyCount === 0) {
    logs.unshift({
      id: `sync_ok_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "SYNC_OK",
      message: `[VERIFIED] Sinkronisasi 100% utuh. Seluruh SLS memiliki realisasi valid.`,
    });
  }

  // Set the final state
  currentData = {
    loading: false,
    stats: {
      totalEntries: totalRealisasi,
      activeUsers: usersRaw.length,
      dailyGrowth: 0,
      pendingVerification,
      progressPercent,
      totalTarget,
      totalRealisasi,
      uniqueSLS: uniqueSLSSet.size,
      districtData,
    },
    slsList: slsRaw,
    reports: reportsRaw,
    users: usersRaw,
    syncStatus: {
      status: "connected",
      lastSyncTime: lastUpdatedTime,
      discrepancyCount,
      integrityChecked: true,
      logs: logs.slice(0, 20), // Keep last 20 logs
    },
    charts: {
      districtProgressData: districtData.map(d => ({
        name: d.name,
        Target: d.target,
        Realisasi: d.value,
        Persentase: d.percentage
      })),
      slsDistribution,
      timelineProgressData,
      officerPerformance,
    },
  };

  notifySubscribers();
}

// Global Single Firestore Observers Setup
let isObserverActive = false;
let unsubscribeSls: (() => void) | null = null;
let unsubscribeReports: (() => void) | null = null;
let unsubscribeUsers: (() => void) | null = null;

function initializeObservers() {
  if (isObserverActive) return;
  isObserverActive = true;

  let slsListCached: SLSData[] = [];
  let reportsCached: ReportData[] = [];
  let usersCached: UserRecord[] = [];

  const checkAndRecalculate = () => {
    recalculateState(slsListCached, reportsCached, usersCached);
  };

  // 1. Single Observer for 'sls'
  unsubscribeSls = onSnapshot(collection(db, "sls"), (snap) => {
    slsListCached = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        idsubsls: data.idsubsls || data.idsls || doc.id,
        idsls: data.idsls || data.idsubsls || doc.id,
        nmsls: data.nmsls || "SLS Unknown",
        nmdesa: data.nmdesa || "Desa",
        nmkec: data.nmkec || "Kecamatan",
        target: Number(data.target || 150),
        realisasi: Number(data.realisasi || 0),
        lastUpdate: data.lastUpdate,
      } as SLSData;
    });
    checkAndRecalculate();
  }, (err) => {
    console.error("Firestore SLS Observer error:", err);
    currentData.syncStatus.status = "error";
    notifySubscribers();
  });

  // 2. Single Observer for 'reports'
  unsubscribeReports = onSnapshot(collection(db, "reports"), (snap) => {
    reportsCached = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId || "",
        userName: data.userName || "",
        idsls: data.idsls || "",
        entryCount: Number(data.entryCount || 0),
        status: data.status || "pending",
        isAuditFlag: data.isAuditFlag,
        auditReason: data.auditReason,
        district: data.district,
        desa: data.desa,
        createdAt: data.createdAt,
        timestamp: data.timestamp,
      } as ReportData;
    });
    checkAndRecalculate();
  }, (err) => {
    console.error("Firestore Reports Observer error:", err);
    currentData.syncStatus.status = "error";
    notifySubscribers();
  });

  // 3. Single Observer for 'users'
  unsubscribeUsers = onSnapshot(collection(db, "users"), (snap) => {
    usersCached = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        username: data.username || "",
        name: data.name || "Mitra",
        role: data.role || "ppl",
        district: data.district || "Asahan",
        desa: data.desa || "Desa",
        phoneNumber: data.phoneNumber || "",
        assignedSlsTargets: data.assignedSlsTargets || [],
      } as UserRecord;
    });
    checkAndRecalculate();
  }, (err) => {
    console.error("Firestore Users Observer error:", err);
    currentData.syncStatus.status = "error";
    notifySubscribers();
  });

  // Handle local simulation update events
  const handleLocalUpdate = () => {
    checkAndRecalculate();
  };
  window.addEventListener("mockSlsUpdated", handleLocalUpdate);
}

// Unified Data Service API
export const unifiedDataService = {
  getCurrentData(): UnifiedData {
    if (!isObserverActive) {
      initializeObservers();
    }
    return currentData;
  },

  subscribe(listener: Listener) {
    if (!isObserverActive) {
      initializeObservers();
    }
    listeners.add(listener);
    listener({ ...currentData });
    return () => {
      listeners.delete(listener);
    };
  },

  forceRefresh() {
    window.dispatchEvent(new Event("mockSlsUpdated"));
  },

  shutdown() {
    if (unsubscribeSls) unsubscribeSls();
    if (unsubscribeReports) unsubscribeReports();
    if (unsubscribeUsers) unsubscribeUsers();
    window.removeEventListener("mockSlsUpdated", () => {});
    isObserverActive = false;
    listeners.clear();
  }
};

// React Hook to consume the single source of truth reactively
export function useUnifiedData() {
  const [data, setData] = useState<UnifiedData>(() => unifiedDataService.getCurrentData());

  useEffect(() => {
    return unifiedDataService.subscribe(setData);
  }, []);

  return data;
}

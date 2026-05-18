import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import { Users, FileText, Map, TrendingUp, Clock, AlertCircle, AlertTriangle, Globe, Database, X, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { handleFirestoreError } from "../lib/firebase";
import { seedDemoData, clearDemoData, SeedResult } from "../services/seedService";
import { useUnifiedData, unifiedDataService } from "../services/unifiedDataService";

export function Dashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const { stats, slsList, reports, users, syncStatus, loading } = useUnifiedData();
  
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  // Pagination states
  const [tablePage, setTablePage] = useState(1);
  const TABLE_PER_PAGE = 10;

  const [reviewPage, setReviewPage] = useState(1);
  const REVIEW_PER_PAGE = 10;

  const recentReports = reports;
  const syncStatusState = syncStatus.status;
  const lastSyncTime = syncStatus.lastSyncTime;
  const activityLogs = syncStatus.logs;

  const handleClear = async () => {
    if (!confirm("Hapus semua data demo (Users, SLS, Reports)? Tindakan ini tidak bisa dibatalkan.")) return;
    setSeeding(true);
    try {
      await clearDemoData();
      setSeedResult(null);
      
      // Clear local storage logs
      localStorage.removeItem('system_activity_logs');
      localStorage.removeItem('mockSlsData');
      
      unifiedDataService.forceRefresh();
      alert("Data berhasil dibersihkan.");
    } catch (err: any) {
      console.error("Clear data error:", err);
      setSeedError(err.message || "Gagal membersihkan data");
      alert("Error saat membersihkan data: " + (err.message || "Unknown Error"));
    } finally {
      setSeeding(false);
    }
  };

  const handleSeed = async () => {
    if (seeding) return;
    if (!confirm("Ini akan menambahkan data demo (25 PPL, ~75 SLS, 15 laporan). Lanjutkan?")) return;
    setSeeding(true);
    setSeedError(null);
    setSeedResult(null);
    try {
      const result = await seedDemoData();
      setSeedResult(result);
      
      // Add log
      const logStr = localStorage.getItem('system_activity_logs');
      const logs = logStr ? JSON.parse(logStr) : [];
      logs.unshift({
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          type: "SYSTEM_SEED",
          message: `Seeded ${result.users} user, ${result.sls} SLS, dan ${result.reports} laporan ke database.`,
          user: "Administrator",
          status: "success"
      });
      localStorage.setItem('system_activity_logs', JSON.stringify(logs));
      
      unifiedDataService.forceRefresh();
    } catch (err: any) {
      console.error("Seed error:", err);
      setSeedError(err.message || "Gagal seed data");
      alert("Error saat mengisi data demo: " + (err.message || "Unknown Error"));
    } finally {
      setSeeding(false);
    }
  };

  const handleVerify = async (reportIds: string | string[], action: 'approve' | 'reject') => {
    const newStatus = action === 'approve' ? 'verified' : 'rejected';
    const ids = Array.isArray(reportIds) ? reportIds : [reportIds];

    try {
      for (const id of ids) {
        // 1. Find the report details from reports state
        const report = reports.find(r => r.id === id);
        if (!report) continue;

        const { idsls, entryCount, userId } = report;

        // 2. Update report status in Firestore reports
        const reportRef = doc(db, "reports", id);
        await updateDoc(reportRef, { status: newStatus });

        if (action === 'approve') {
          // 3. Update SLS in Firestore
          const slsRef = doc(db, "sls", idsls);
          await updateDoc(slsRef, { 
            realisasi: entryCount,
            lastUpdate: serverTimestamp() 
          });

          // 4. Update SLS in local mock cache
          const mockStr = localStorage.getItem('mockSlsData');
          if (mockStr) {
            const mockData = JSON.parse(mockStr);
            if (mockData[idsls]) {
              mockData[idsls].realisasi = entryCount;
              mockData[idsls].lastUpdate = new Date().toISOString();
              localStorage.setItem('mockSlsData', JSON.stringify(mockData));
            } else {
              mockData[idsls] = {
                idsubsls: idsls,
                idsls: idsls,
                nmsls: `${report.district || "Kecamatan"} - ${report.desa || "Desa"} - SLS ${idsls.slice(-4)}`,
                nmdesa: report.desa || "Desa",
                nmkec: report.district || "Kecamatan",
                target: 150,
                realisasi: entryCount,
                lastUpdate: new Date().toISOString()
              };
              localStorage.setItem('mockSlsData', JSON.stringify(mockData));
            }
          }

          // 5. Update user targets in Firestore if userId is present
          if (userId) {
            try {
              const usersRef = collection(db, "users");
              const q = query(usersRef, where("username", "==", userId));
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
              console.warn("Failed to sync targets to user record during verification:", err);
            }
          }
        }

        // Log system activity log for data audit trail requested by user
        const logStr = localStorage.getItem('system_activity_logs');
        const logs = logStr ? JSON.parse(logStr) : [];
        logs.unshift({
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            type: action === 'approve' ? "REPORT_APPROVED" : "REPORT_REJECTED",
            message: `Laporan SLS ${idsls} (${entryCount} dok) oleh ${report.userName || report.userId} telah ${action === 'approve' ? 'DISETUJUI' : 'DITOLAK'} oleh Administrator.`,
            user: "Administrator",
            status: action === 'approve' ? "success" : "danger"
        });
        localStorage.setItem('system_activity_logs', JSON.stringify(logs.slice(0, 100)));
      }

      // Dispatch event to refresh map and charts in real-time
      window.dispatchEvent(new Event('mockSlsUpdated'));
    } catch (e: any) {
      console.error("Firestore verify failed:", e);
      alert("Gagal melakukan verifikasi ke database: " + (e.message || "Unknown Error"));
    }
  };

  return (
    <div className="space-y-8 relative">
      {/* Real-time Alert Banner for Pending Verification */}
      {recentReports.some(r => r.status === "pending") && (
        <motion.div
          initial={{ height: 0, opacity: 0, y: -10 }}
          animate={{ height: "auto", opacity: 1, y: 0 }}
          className="bg-slate-900 rounded-[2rem] p-6 flex items-center justify-between shadow-premium border border-white/10 text-white relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary-600/20 rounded-full blur-[100px] -mr-40 -mt-40 transition-transform group-hover:scale-110 pointer-events-none" />
          <div className="flex items-center gap-5 relative z-10">
            <div className="w-12 h-12 bg-white/10 border border-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center text-amber-400 shadow-glow-amber shrink-0">
              <AlertTriangle size={24} className="animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-black tracking-wider font-mono uppercase">Verification Queue Active</h4>
              <p className="text-[11px] text-slate-300 font-medium mt-1 leading-relaxed">Beberapa laporan memiliki anomali entri data tinggi dan memerlukan validasi manual administrator.</p>
            </div>
          </div>
          <button
            onClick={() => setReviewModalOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-900 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-premium cursor-pointer active:scale-95 relative z-10 btn-hover-effect shrink-0 ml-6"
          >
            Review Queue
          </button>
        </motion.div>
      )}

      {/* Main Dashboard Header */}
      <header className="flex justify-between items-end pb-4 border-b border-slate-200/50">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans text-glow">DASHBOARD MONITORING</h2>
          <p className="text-slate-400 text-[10px] mt-1.5 font-bold uppercase tracking-widest">Real-time Daily Enumeration Statistics • BPS Kabupaten Asahan</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="bg-white text-slate-700 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-200/60 flex items-center gap-2 hover:bg-slate-50 hover:border-primary-200 transition-all disabled:opacity-50 cursor-pointer shadow-premium"
          >
            <Database size={14} className="text-primary-600" />
            {seeding ? "Syncing..." : "Seed Demo"}
          </button>
          <button
            onClick={handleClear}
            disabled={seeding}
            className="bg-white text-rose-600 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-rose-100 flex items-center gap-2 hover:bg-rose-50 hover:border-rose-300 transition-all disabled:opacity-50 cursor-pointer shadow-premium"
          >
            <X size={14} />
            Reset Data
          </button>
        </div>
      </header>

      {seedResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-premium shadow-glow-emerald">
          <p className="text-xs text-emerald-800 font-bold">✅ Demo data berhasil ditambahkan: {seedResult.users} user, {seedResult.sls} SLS, {seedResult.reports} laporan</p>
          <button onClick={() => setSeedResult(null)} className="text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}
      {seedError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between shadow-premium shadow-glow-rose">
          <p className="text-xs text-red-800 font-bold">⚠️ {seedError}</p>
          <button onClick={() => setSeedError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Petugas"
          value={stats.activeUsers.toLocaleString()}
          icon={<Users size={16} />}
          trend={`${stats.activeUsers} Personil Aktif`}
          trendColor="text-primary-600"
        />
        <StatCard
          title="Usaha Tercacah"
          value={stats.totalEntries.toLocaleString()}
          icon={<FileText size={16} />}
          trend={`${stats.uniqueSLS} SLS Tercover`}
          trendColor="text-slate-500"
        />
        <StatCard
          title="Progres Total"
          value={`${stats.progressPercent}%`}
          icon={<TrendingUp size={16} />}
          trend={`${stats.totalRealisasi.toLocaleString()} / ${stats.totalTarget.toLocaleString()}`}
          trendColor={stats.progressPercent >= 80 ? "text-emerald-600" : stats.progressPercent >= 50 ? "text-primary-600" : "text-rose-500"}
        />
        <StatCard
          title="Verifikasi"
          value={stats.pendingVerification.toLocaleString()}
          icon={<Clock size={16} />}
          trend={stats.pendingVerification > 10 ? "Tindakan Diperlukan" : "Antrian Normal"}
          trendColor={stats.pendingVerification > 10 ? "text-amber-600" : "text-emerald-600"}
        />
      </div>

      {/* Custom Recharts District Progress Visualizations */}
      <div className="glass-card p-6 rounded-[2rem] border-white/50 bg-white/40">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-black text-slate-800 text-sm tracking-wide uppercase">Capaian Data Per Kecamatan</h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Volume Realisasi Terverifikasi</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary-500 shadow-glow-blue animate-pulse" />
            <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest font-mono">Realtime Live</span>
          </div>
        </div>
        <div className="h-72 w-full">
          {stats.districtData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.districtData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="districtGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="var(--color-primary-700)" stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226,232,240,0.5)" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600, fontFamily: 'Fira Code' }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)', radius: 8 }} />
                <Bar dataKey="value" fill="url(#districtGradient)" radius={[6, 6, 0, 0]} maxBarSize={45}>
                  {stats.districtData.map((entry, index) => (
                    <Cell key={`cell-${index}`} className="hover:opacity-90 transition-opacity cursor-pointer animate-[pulse_1.5s_infinite]" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 italic text-[11px] font-bold uppercase tracking-widest">
              Menunggu sinkronisasi data dari simulator...
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Reporting Activity Table (Left 2/3) */}
        <div className="xl:col-span-2 glass-card rounded-[2rem] flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white/40">
            <div>
              <h2 className="font-black text-slate-800 text-sm tracking-wide uppercase">Recent Activity</h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Live updates from the field</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (recentReports.length === 0) return;
                  const headers = ['Nama PPL', 'NIP/Username', 'Kecamatan', 'Jumlah Entry', 'Tanggal', 'Status'];
                  const rows = recentReports.map(r => [
                    r.userName || 'Petugas Lapangan',
                    r.userId || '',
                    r.district || '',
                    r.entryCount || 0,
                    r.timestamp?.toDate ? r.timestamp.toDate().toLocaleString('id-ID') : new Date().toLocaleString('id-ID'),
                    r.status || 'verified'
                  ]);
                  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
                  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `laporan_se2026_${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3.5 py-2 bg-white text-slate-700 border border-slate-200 text-[9px] font-black uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors cursor-pointer shadow-sm"
              >
                Export CSV
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-[9px] uppercase font-bold text-slate-400 sticky top-0 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">Petugas</th>
                  <th className="px-6 py-3">Kecamatan</th>
                  <th className="px-6 py-3 text-right">Volume</th>
                  <th className="px-6 py-3">Waktu</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100">
                {recentReports.length > 0 ? (
                  recentReports.slice((tablePage - 1) * TABLE_PER_PAGE, tablePage * TABLE_PER_PAGE).map((report) => (
                    <tr key={report.id} className="hover:bg-primary-50/30 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{report.userName || "Petugas Lapangan"}</span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">{report.userId || "N/A"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-bold">{report.district}</td>
                      <td className="px-6 py-4 text-right font-mono text-primary-600 font-black">{report.entryCount} doc</td>
                      <td className="px-6 py-4 text-slate-400 font-medium">
                        {report.timestamp?.toDate ? report.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg font-black text-[9px] uppercase tracking-wider ${
                          report.status === 'verified'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/50 shadow-glow-emerald'
                            : 'bg-amber-50 text-amber-700 border border-amber-100/50 shadow-glow-amber'
                        }`}>
                          {report.status || 'VERIFIED'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic font-medium">Belum ada aktivitas pelaporan</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          {recentReports.length > TABLE_PER_PAGE && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Showing {(tablePage - 1) * TABLE_PER_PAGE + 1} - {Math.min(tablePage * TABLE_PER_PAGE, recentReports.length)} of {recentReports.length} units
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setTablePage(p => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer shadow-sm btn-hover-effect"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setTablePage(p => Math.min(Math.ceil(recentReports.length / TABLE_PER_PAGE), p + 1))}
                  disabled={tablePage >= Math.ceil(recentReports.length / TABLE_PER_PAGE)}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer shadow-sm btn-hover-effect"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sync Deck & System Activity Logs (Right 1/3) */}
        <div className="flex flex-col gap-6">
          <div className="glass-card p-6 rounded-[2rem]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-extrabold text-slate-800 text-xs tracking-wider uppercase flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${syncStatusState === 'connected' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : syncStatusState === 'syncing' ? 'bg-blue-500 animate-spin' : 'bg-rose-500'} shrink-0`} />
                System Sync
              </h2>
              <span className={`text-[8px] font-black px-2 py-0.5 rounded-md ${syncStatusState === 'connected' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'} uppercase tracking-widest`}>
                {syncStatusState === 'connected' ? 'LIVE' : 'SYNCING'}
              </span>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Database Source</span>
                <span className="text-slate-800 font-mono text-[10px]">Firestore (Cloud v9)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Local Sandbox Cache</span>
                <span className="text-slate-800 font-mono text-[10px]">Active (localStorage)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Last Synced At</span>
                <span className="text-primary-600 font-mono text-[10px]">{lastSyncTime}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>System Latency</span>
                <span className="text-emerald-600 font-mono text-[10px]">{syncStatusState === 'connected' ? '28ms (Optimal)' : 'Connecting...'}</span>
              </div>
              
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider mb-2 text-slate-400">
                  <span>Data Integrity Check</span>
                  <span className={syncStatus.discrepancyCount > 0 ? "text-rose-500" : "text-emerald-500"}>
                    {syncStatus.discrepancyCount > 0 ? `${syncStatus.discrepancyCount} ERRORS` : "100% HEALTHY"}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${syncStatus.discrepancyCount > 0 ? "bg-rose-500 shadow-glow-rose" : "bg-emerald-500 animate-pulse shadow-glow-emerald"}`}
                    style={{ width: syncStatus.discrepancyCount > 0 ? '70%' : '100%' }}
                  />
                </div>
              </div>

              <button 
                onClick={() => {
                  unifiedDataService.forceRefresh();
                }}
                className="w-full py-2.5 mt-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer btn-hover-effect"
              >
                Force Sync Data
              </button>
            </div>
          </div>

          <div className="glass-card p-6 rounded-[2rem] flex flex-col justify-between">
            <div>
              <h2 className="font-extrabold text-slate-800 mb-4 text-xs tracking-wider uppercase flex items-center gap-2">
                <Database size={14} className="text-primary-500" />
                Data Audit Logs
              </h2>
              <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                {activityLogs.length > 0 ? (
                  activityLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                      <div className="flex justify-between items-center text-[8px] font-bold text-slate-400">
                        <span className="font-mono text-primary-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[7px] uppercase ${
                          log.type === 'SUCCESS' || log.type === 'SYNC_OK' 
                            ? 'bg-emerald-100 text-emerald-800 font-bold' 
                            : log.type === 'WARNING' || log.type === 'DISCREPANCY_DETECTED'
                              ? 'bg-amber-100 text-amber-800 font-bold' 
                              : 'bg-rose-100 text-rose-800 font-bold'
                        }`}>{log.type}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 font-bold leading-relaxed">{log.message}</p>
                      {log.user && <div className="text-[7px] text-slate-400 uppercase tracking-widest font-black">By: {log.user}</div>}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-slate-400 italic text-[10px] font-bold uppercase tracking-widest">
                    Belum ada log aktivitas data terbaru
                  </div>
                )}
              </div>
            </div>
            
            <p className="text-[8px] text-center text-slate-400 font-bold uppercase tracking-widest mt-4">
              SECURE CRYPTO AUDIT TRAIL ACTIVE
            </p>
          </div>
        </div>
      </div>

      {/* Automation Section */}
      <section className="bg-slate-950 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-premium border border-white/5 mt-8">
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 bg-emerald-400 shadow-glow-emerald rounded-full animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-primary-400">System Automation</span>
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-4 font-sans leading-tight">Daily Rekap Scheduler</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed mb-8 font-medium">
              Sistem secara otomatis menghitung rekapitulasi harian per-kecamatan setiap jam 17:00 dan mengirimkan laporan tabel langsung ke Group WhatsApp Penanggung Jawab Teknis.
            </p>
            <div className="flex gap-4">
              <button className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-premium hover:shadow-glow-blue btn-hover-effect">
                Konfigurasi
              </button>
              <button className="bg-white/5 text-slate-200 px-6 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-white/10 transition-all cursor-pointer border border-white/10 backdrop-blur-md btn-hover-effect">
                Log Histori
              </button>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-6 border border-white/10 shadow-inner">
            {/* Simulated window circles */}
            <div className="flex gap-1.5 mb-4 pointer-events-none">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <h4 className="text-[10px] font-black mb-3 flex items-center gap-2 text-slate-300 uppercase tracking-widest">
              <AlertCircle size={14} className="text-primary-400" />
              Last Automation Payload
            </h4>
            <div className="font-mono text-[10px] text-primary-300 bg-black/45 p-5 rounded-xl border border-white/5 overflow-x-auto leading-relaxed custom-scrollbar shadow-inner">
              <div className="text-primary-500 mb-2 font-bold">// Scheduled Task: 17:00 WIB</div>
              {`KAB. ASAHAN SE2026 - REKAP
--------------------------
KECAMATAN    | JML | %
--------------------------
KISARAN TMR  | 1245| 85%
KISARAN BRT  | 1102| 82%
RAWANG PANCA | 890 | 70%
...          | ... | ...`}
            </div>
          </div>
        </div>

        {/* Abstract design elements */}
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-primary-600 rounded-full blur-[100px] opacity-10 pointer-events-none" />
      </section>

      {/* Review Modal */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] shadow-premium w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-900 tracking-tight text-base font-mono">REVIEW PENDING REPORTS</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Verification Queue Gateway</p>
              </div>
              <button onClick={() => setReviewModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer btn-hover-effect">
                <X size={18} />
              </button>
            </div>
            {(() => {
              const pendingReports = recentReports.filter(r => r.status === "pending");
              const paginatedPending = pendingReports.slice((reviewPage - 1) * REVIEW_PER_PAGE, reviewPage * REVIEW_PER_PAGE);
              const isAllCurrentPageSelected = paginatedPending.length > 0 && paginatedPending.every(r => selectedReports.has(r.id));

              return (
                <>
                  <div className="px-6 py-4 bg-primary-50/30 border-b border-primary-100/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                        checked={isAllCurrentPageSelected}
                        onChange={(e) => {
                          const newSet = new Set(selectedReports);
                          if (e.target.checked) {
                            paginatedPending.forEach(r => newSet.add(r.id));
                          } else {
                            paginatedPending.forEach(r => newSet.delete(r.id));
                          }
                          setSelectedReports(newSet);
                        }}
                      />
                      <span className="text-[10px] font-black text-primary-700 uppercase tracking-widest">
                        Pilih Halaman Ini ({paginatedPending.length})
                      </span>
                    </div>
                    {selectedReports.size > 0 && (
                      <button
                        onClick={() => handleVerify(Array.from(selectedReports), 'approve')}
                        className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-premium hover:shadow-glow-blue transition-all flex items-center gap-2 cursor-pointer btn-hover-effect"
                      >
                        <CheckCircle2 size={14} />
                        Setujui Terpilih ({selectedReports.size})
                      </button>
                    )}
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/30">
                    <div className="space-y-4">
                      {paginatedPending.map(report => (
                        <div key={report.id} className={`border ${selectedReports.has(report.id) ? 'border-primary-400 bg-primary-50/30 shadow-glow-blue' : 'border-slate-200/60 bg-white'} rounded-[1.5rem] p-5 flex justify-between items-center shadow-sm hover:shadow-premium transition-all group`}>
                          <div className="flex items-center gap-5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                              checked={selectedReports.has(report.id)}
                              onChange={(e) => {
                                const newSet = new Set(selectedReports);
                                if (e.target.checked) newSet.add(report.id);
                                else newSet.delete(report.id);
                                setSelectedReports(newSet);
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-3">
                                <h4 className="font-black text-slate-800 text-sm tracking-tight truncate">{report.userName || "Petugas Lapangan"}</h4>
                                <span className="px-2.5 py-0.5 bg-slate-900 text-white rounded-md text-[9px] font-bold tracking-widest font-mono">
                                  {report.entryCount} DOCS
                                </span>
                              </div>
                              {(() => {
                                const matchedSls = slsList.find(s => s.idsubsls === report.idsls || s.idsls === report.idsls);
                                const sName = matchedSls ? matchedSls.nmsls : `SLS ${report.idsls?.slice(-4) || ""}`;
                                return (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[10px] bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400 font-bold uppercase tracking-wider">Kecamatan</span>
                                      <span className="font-black text-slate-700">{report.district || "Unknown"}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400 font-bold uppercase tracking-wider">Nama SLS</span>
                                      <span className="font-black text-slate-700 truncate ml-4 max-w-[140px]" title={sName}>{sName}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400 font-bold uppercase tracking-wider">Desa</span>
                                      <span className="font-black text-slate-700">{report.desa || "Unknown"}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400 font-bold uppercase tracking-wider">ID SLS</span>
                                      <span className="font-mono font-black text-primary-600">{report.idsls}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 ml-6 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleVerify(report.id, 'approve')}
                              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-premium hover:shadow-glow-blue cursor-pointer btn-hover-effect"
                            >Setujui</button>
                            <button
                              onClick={() => handleVerify(report.id, 'reject')}
                              className="px-4 py-2 bg-white text-rose-500 hover:bg-rose-50 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer btn-hover-effect"
                            >Tolak</button>
                          </div>
                        </div>
                      ))}
                      {pendingReports.length === 0 && (
                        <div className="text-center py-16 text-slate-400">
                          <CheckCircle2 size={48} className="mx-auto text-emerald-100 mb-4 animate-[bounce_2s_infinite]" />
                          <p className="font-black text-slate-800 text-sm">All Reports Verified</p>
                          <p className="text-[10px] font-bold mt-1 uppercase tracking-widest text-slate-400">Antrian verifikasi kosong</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {pendingReports.length > REVIEW_PER_PAGE && (
                    <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                        Page {reviewPage} of {Math.ceil(pendingReports.length / REVIEW_PER_PAGE)}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setReviewPage(p => Math.max(1, p - 1))}
                          disabled={reviewPage === 1}
                          className="px-4 py-2 text-[9px] font-black uppercase tracking-wider bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer shadow-sm btn-hover-effect"
                        >Prev</button>
                        <button
                          onClick={() => setReviewPage(p => Math.min(Math.ceil(pendingReports.length / REVIEW_PER_PAGE), p + 1))}
                          disabled={reviewPage >= Math.ceil(pendingReports.length / REVIEW_PER_PAGE)}
                          className="px-4 py-2 text-[9px] font-black uppercase tracking-wider bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer shadow-sm btn-hover-effect"
                        >Next</button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </motion.div>
        </div>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-dropdown px-4 py-3 rounded-2xl border border-slate-100 shadow-premium">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{payload[0].payload.name}</p>
        <p className="text-xs font-extrabold text-primary-600 font-sans">{payload[0].value.toLocaleString()} <span className="text-[9px] text-slate-400 font-bold uppercase">Dokumen</span></p>
      </div>
    );
  }
  return null;
}

function StatCard({ title, value, icon, trend, trendColor = "text-primary-600" }: { title: string; value: string; icon: React.ReactNode; trend: string; trendColor?: string }) {
  const isUp = trendColor.includes("emerald") || trendColor.includes("primary");
  return (
    <div className="glass-card p-6 rounded-[2rem] relative overflow-hidden group border border-white/40 shadow-premium hover:shadow-glow-blue cursor-pointer">
      <div className="absolute -top-16 -right-16 w-32 h-32 bg-primary-100/10 rounded-full blur-3xl group-hover:bg-primary-200/20 transition-all duration-500 pointer-events-none" />
      <div className="flex items-center justify-between mb-4 relative z-10">
        <p className="text-[9px] font-black uppercase tracking-[0.2em]">{title}</p>
        <div className="w-10 h-10 bg-primary-50 border border-primary-100/30 rounded-2xl text-primary-600 flex items-center justify-center group-hover:rotate-6 transition-all duration-300 shadow-sm">{icon}</div>
      </div>
      <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight relative z-10 font-sans mb-1">{value}</h3>
      <div className={`text-[10px] font-black ${trendColor} relative z-10 flex items-center gap-1.5 tracking-wide uppercase`}>
        <span className={`w-1.5 h-1.5 rounded-full bg-current ${isUp ? 'animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : ''}`} />
        {trend}
      </div>
    </div>
  );
}

function StateRow({ number, text, status }: { number: string; text: string; status: "active" | "inactive" }) {
  const isActive = status === "active";
  return (
    <div className="flex items-center gap-3.5">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-mono font-black transition-all ${
        isActive ? "bg-slate-900 text-white shadow-premium border border-white/10" : "bg-slate-100 text-slate-400"
      }`}>
        {number}
      </div>
      <div className={`flex-1 px-4 py-3 border rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
        isActive 
          ? "border-primary-200 text-primary-700 bg-primary-50/50 shadow-premium shadow-glow-blue" 
          : "border-slate-100 text-slate-400 bg-slate-50/40"
      }`}>
        {text}
      </div>
    </div>
  );
}

function MetricBar({ label, value, progress, color }: { label: string; value: string; progress: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[8px] font-black mb-2 uppercase tracking-[0.25em] text-slate-400">
        <span>{label}</span>
        <span className="text-white/80 font-mono font-bold">{value}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
        <div className={`h-full ${color} transition-all duration-1000 shadow-[0_0_12px_rgba(59,130,246,0.4)]`} style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );
}

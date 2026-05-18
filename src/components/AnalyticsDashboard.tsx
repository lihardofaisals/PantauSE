import React, { useState, useEffect } from "react";
import { useUnifiedData } from "../services/unifiedDataService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend
} from "recharts";
import {
  TrendingUp,
  Award,
  Database,
  Users,
  Compass,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Filter,
  Layers,
  ArrowUpRight,
  UserCheck
} from "lucide-react";
import { motion } from "motion/react";

const COLORS = ["#007AFF", "#34C759", "#FF9500", "#FF3B30", "#AF52DE", "#5AC8FA"];

export function AnalyticsDashboard() {
  const { stats, slsList, reports, users, syncStatus, charts, loading } = useUnifiedData();
  const [selectedKec, setSelectedKec] = useState<string>("ALL");

  // Compute unique Kecamatan lists using standardized parsing rule matching other modules
  const kecamatans = Array.from(new Set(slsList.map(s => s.nmkec || s.nmsls?.split(' - ')[0] || "KISARAN BARAT"))).sort();

  // Filtered SLS lists for regional distribution chart
  const filteredSls = slsList.filter(s => {
    if (selectedKec === "ALL") return true;
    const kec = s.nmkec || s.nmsls?.split(' - ')[0] || "KISARAN BARAT";
    return kec.toLowerCase() === selectedKec.toLowerCase();
  });

  // Pull calculations directly from Centralized Sync Engine (Single Source of Truth)
  const districtProgressData = charts.districtProgressData;
  const officerPerformance = charts.officerPerformance;
  const timelineProgressData = charts.timelineProgressData;

  // Regional SLS status distributions recalculated on current filter
  let lowProgressCount = 0;   // < 50%
  let mediumProgressCount = 0; // 50% - 99%
  let highProgressCount = 0;   // 100%

  filteredSls.forEach(s => {
    const pct = s.target > 0 ? (s.realisasi / s.target) * 100 : 0;
    if (pct >= 100) highProgressCount++;
    else if (pct >= 50) mediumProgressCount++;
    else lowProgressCount++;
  });

  const distributionData = [
    { name: "Progress Rendah (<50%)", value: lowProgressCount, color: "#FF3B30" },
    { name: "Progress Sedang (50-99%)", value: mediumProgressCount, color: "#007AFF" },
    { name: "Progress Selesai (100%)", value: highProgressCount, color: "#34C759" }
  ].filter(d => d.value > 0);

  const totalTarget = stats.totalTarget;
  const totalRealisasi = stats.totalRealisasi;
  const overallProgressPct = stats.progressPercent;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <TrendingUp size={24} className="animate-spin text-primary-500 mr-2" />
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Aggregating Advanced Charts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Tab Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200/50">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans text-glow uppercase">Analytics & Comparison Chart</h2>
          <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase tracking-widest">Advanced Visual Insights • SE2026 Telemetry Suite</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <Filter size={14} className="text-slate-400 mr-2" />
            <select
              value={selectedKec}
              onChange={e => setSelectedKec(e.target.value)}
              className="text-[10px] font-black uppercase tracking-wider text-slate-700 outline-none cursor-pointer bg-transparent"
            >
              <option value="ALL">Seluruh Kecamatan</option>
              {kecamatans.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Advanced SaaS Telemetry cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="glass-card p-6 rounded-3xl border border-white/50 bg-white/40 shadow-premium flex items-center gap-4">
          <div className="w-11 h-11 bg-primary-50 border border-primary-100 rounded-2xl flex items-center justify-center text-primary-600 shadow-sm">
            <Layers size={18} />
          </div>
          <div>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Overall Target</span>
            <span className="text-lg font-extrabold text-slate-800 font-sans tracking-tight">{totalTarget.toLocaleString()} <span className="text-[9px] font-medium text-slate-400 uppercase">Usaha</span></span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/50 bg-white/40 shadow-premium flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Total Realisasi</span>
            <span className="text-lg font-extrabold text-slate-800 font-sans tracking-tight">{totalRealisasi.toLocaleString()} <span className="text-[9px] font-medium text-slate-400 uppercase">Usaha</span></span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/50 bg-white/40 shadow-premium flex items-center gap-4">
          <div className="w-11 h-11 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm animate-pulse">
            <TrendingUp size={18} />
          </div>
          <div>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Penyelesaian Rata-rata</span>
            <span className="text-lg font-extrabold text-slate-800 font-sans tracking-tight">{overallProgressPct}%</span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/50 bg-white/40 shadow-premium flex items-center gap-4">
          <div className="w-11 h-11 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
            <Users size={18} />
          </div>
          <div>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Mitra Lapangan</span>
            <span className="text-lg font-extrabold text-slate-800 font-sans tracking-tight">{users.length} <span className="text-[9px] font-medium text-slate-400 uppercase">Petugas</span></span>
          </div>
        </div>
      </div>

      {/* Main 2-Column charts panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Chart 1: Perbandingan Progres Antar Kecamatan */}
        <div className="glass-card p-6 rounded-[2rem] border border-white/50 bg-white/40 shadow-premium">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 tracking-wider font-sans uppercase">Progres Antar Kecamatan</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Persentase pencapaian target berdasarkan beban usaha per Kecamatan</p>
            </div>
            <Award size={16} className="text-primary-600" />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={districtProgressData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 9, fontWeight: "bold" }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 8, fontWeight: "black", fill: "#475569" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "1rem", border: "none", color: "white" }}
                  labelStyle={{ fontSize: "10px", fontWeight: "black", color: "#94a3b8", fontFamily: "monospace" }}
                  itemStyle={{ fontSize: "11px", fontWeight: "bold" }}
                />
                <Bar dataKey="Persentase" fill="#007AFF" radius={[0, 4, 4, 0]}>
                  {districtProgressData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Target vs Realisasi Cumulative Trends */}
        <div className="glass-card p-6 rounded-[2rem] border border-white/50 bg-white/40 shadow-premium">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 tracking-wider font-sans uppercase">Akumulasi Target vs Realisasi</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Perkembangan akumulasi pencacahan usaha dari Minggu ke Minggu</p>
            </div>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineProgressData} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#007AFF" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#007AFF" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34C759" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#34C759" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: "bold" }} />
                <YAxis tick={{ fontSize: 9, fontWeight: "bold" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "1rem", border: "none", color: "white" }}
                  labelStyle={{ fontSize: "10px", fontWeight: "black", color: "#94a3b8", fontFamily: "monospace" }}
                  itemStyle={{ fontSize: "11px", fontWeight: "bold" }}
                />
                <Legend wrapperStyle={{ fontSize: 10, fontWeight: "black", textTransform: "uppercase" }} />
                <Area type="monotone" dataKey="Target" stroke="#007AFF" strokeWidth={2} fillOpacity={1} fill="url(#colorTarget)" />
                <Area type="monotone" dataKey="Realisasi" stroke="#34C759" strokeWidth={3} fillOpacity={1} fill="url(#colorReal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Distribusi Progress Wilayah SLS */}
        <div className="glass-card p-6 rounded-[2rem] border border-white/50 bg-white/40 shadow-premium">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 tracking-wider font-sans uppercase">Distribusi Progres SLS</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Klasifikasi tingkat penyelesaian SLS di bawah Kecamatan terpilih</p>
            </div>
            <Compass size={16} className="text-amber-500" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "1rem", border: "none", color: "white" }}
                    itemStyle={{ fontSize: "11px", fontWeight: "bold" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              {distributionData.map((d, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-wide">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 font-sans">{d.value} <span className="text-[8px] font-bold text-slate-400 uppercase">SLS</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 4: Top 10 Officer Rankings */}
        <div className="glass-card p-6 rounded-[2rem] border border-white/50 bg-white/40 shadow-premium">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 tracking-wider font-sans uppercase">Top 10 Performansi Petugas</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Mitra lapangan dengan tingkat persentase penyelesaian SLS tertinggi</p>
            </div>
            <UserCheck size={16} className="text-emerald-500" />
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
            {officerPerformance.length > 0 ? (
              officerPerformance.map((officer, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-slate-150 flex items-center justify-between shadow-sm transition-all hover:border-primary-200">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg font-black text-xs flex items-center justify-center ${idx === 0 ? 'bg-amber-100 text-amber-700 shadow-glow-amber border border-amber-200' : idx === 1 ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-primary-50 text-primary-700 border border-primary-100'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-800 leading-tight font-mono">{officer.name}</p>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{officer.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-800 leading-none mb-1 font-mono">{officer.Persentase}%</p>
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">{officer.Realisasi} / {officer.Target} Usaha</p>
                    </div>
                    <div className="w-16 bg-slate-150 h-1.5 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${officer.Persentase}%` }} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center p-8 text-slate-400 italic text-xs uppercase tracking-widest font-semibold">
                Belum ada data performa petugas.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* SLS Coverage & Target Lists Table */}
      <div className="glass-card p-6 rounded-[2rem] border border-white/50 bg-white/40 shadow-premium">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xs font-black text-slate-900 tracking-wider font-mono uppercase">Statistik Capaian Per SLS</h3>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Daftar lengkap beban target versus pencapaian di lapangan per SLS</p>
          </div>
          <Database size={16} className="text-primary-600" />
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-4 py-3 text-[8px] font-bold text-slate-400 uppercase tracking-widest">ID SLS / Sub SLS</th>
                <th className="px-4 py-3 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Nama SLS / Wilayah</th>
                <th className="px-4 py-3 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Target</th>
                <th className="px-4 py-3 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Realisasi</th>
                <th className="px-4 py-3 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Progres</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSls.slice(0, 10).map((s, idx) => {
                const pct = Math.min(100, Math.round((s.realisasi / (s.target || 150)) * 100));
                return (
                  <tr key={idx} className="hover:bg-primary-50/20 transition-all font-mono">
                    <td className="px-4 py-3 text-[10px] font-black text-slate-700">{s.id || s.idsls}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase">{s.nmsls || "SLS Desa " + (s.nmdesa?.split(' - ')[0] || "Bunut")}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-slate-800">{s.target || 150}</td>
                    <td className="px-4 py-3 text-[10px] font-black text-primary-600">{s.realisasi || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-800 w-8">{pct}%</span>
                        <div className="w-24 bg-slate-100 h-1 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-primary-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredSls.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400 italic font-medium uppercase tracking-widest">Tidak ada data SLS ditemukan</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

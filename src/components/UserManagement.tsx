import React, { useState, useEffect } from "react";
import { db, handleFirestoreError } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from "firebase/firestore";
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  Save,
  X,
  Download,
  Upload,
  UserPlus,
  Shield,
  Phone,
  MapPin,
  Key,
  Database,
  ChevronDown,
  Calendar,
  Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SlsTarget {
  idsls: string;
  nmsls: string;
  target: number;
  realisasi: number;
  progressPct: number;
  deadline: string;
}

interface UserRecord {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: "admin" | "ppl" | "pml";
  district: string;
  desa: string;
  subSls: string;
  subSlsName?: string;
  phoneNumber: string;
  assignedAgent?: string;
  lastLogin?: any;
  mustChangePassword?: boolean;
  assignedSlsTargets?: SlsTarget[];
}

export function UserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Geo Hierarchy State
  const [geoHierarchy, setGeoHierarchy] = useState<any>({});
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<UserRecord>>({
    role: "ppl",
    district: "",
    desa: "",
    subSls: "",
    username: "",
    password: "",
    name: "",
    phoneNumber: "",
    assignedAgent: "GATEWAY_CORE_v4"
  });

  const [assignedSlsTargets, setAssignedSlsTargets] = useState<SlsTarget[]>([]);

  // Load Geo Hierarchy for selectors
  useEffect(() => {
    const loadGeo = async () => {
      setIsLoadingGeo(true);
      try {
        const response = await fetch('/maps/peta_sls_202511208.geojson');
        const data = await response.json();

        const hierarchy: any = {};
        data.features.forEach((f: any) => {
          const kec = f.properties.nmkec || "Unknown";
          const desa = f.properties.nmdesa || "Unknown";
          const sls = f.properties.nm_sls || f.properties.nmsls || "Unknown";
          const id = f.properties.idsls || f.properties.idsubsls;

          if (!hierarchy[kec]) hierarchy[kec] = {};
          if (!hierarchy[kec][desa]) hierarchy[kec][desa] = [];
          hierarchy[kec][desa].push({ id, name: sls });
        });
        setGeoHierarchy(hierarchy);
      } catch (err) {
        console.error("Failed to load map hierarchy:", err);
      } finally {
        setIsLoadingGeo(false);
      }
    };
    loadGeo();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("username", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const u = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserRecord));
      setUsers(u);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, "list", "users");
    });
    return () => unsub();
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const downloadTemplate = () => {
    const headers = ['Nama', 'Username', 'Password', 'Role', 'Kecamatan', 'Desa', 'Sub SLS', 'No HP', 'Alokasi Target (SLS:Target:Deadline)'];
    const row = ['Budi', 'budi_ppl', '123456', 'ppl', 'Kisaran Barat', 'Bunut', '12080600100001', '628123456789', '12080600100001:150:2026-06-30|12080600100002:100:2026-06-30'];
    const row2 = ['Siti', 'siti_pml', '654321', 'pml', 'Kisaran Timur', 'Mutiara', '12080100200001', '628987654321', '12080100200001:80:2026-06-30'];
    const csv = [headers, row, row2].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_petugas.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split('\n').filter(row => row.trim().length > 0);
        if (rows.length < 2) {
          alert("CSV kosong atau tidak valid");
          return;
        }

        const totalRows = rows.length - 1;

        for (let i = 1; i <= totalRows; i++) {
          const cells = rows[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          const roleValue = cells[3]?.toLowerCase();

          const slsTargets: SlsTarget[] = [];
          if (cells[8]) {
            cells[8].split('|').forEach(tStr => {
              const parts = tStr.split(':');
              if (parts[0]) {
                slsTargets.push({
                  idsls: parts[0],
                  nmsls: "SLS " + parts[0].slice(-4),
                  target: parseInt(parts[1]) || 150,
                  realisasi: 0,
                  progressPct: 0,
                  deadline: parts[2] || "2026-06-30"
                });
              }
            });
          }

          const userObj = {
            name: cells[0] || "",
            username: cells[1] || "",
            password: cells[2] || "",
            role: (roleValue === 'admin' ? 'admin' : roleValue === 'pml' ? 'pml' : 'ppl'),
            district: cells[4] || "",
            desa: cells[5] || "",
            subSls: cells[6] || "",
            phoneNumber: cells[7] || "",
            assignedAgent: "GATEWAY_CORE_v4",
            mustChangePassword: true,
            createdAt: serverTimestamp(),
            lastLogin: null,
            assignedSlsTargets: slsTargets
          };

          if (userObj.username && userObj.name) {
            await addDoc(collection(db, "users"), userObj);
          }
          setUploadProgress(Math.round((i / totalRows) * 100));
        }
      } catch (err) {
        console.error(err);
        alert("Gagal memproses CSV");
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        e.target.value = ''; // Reset input
      }
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    try {
      const finalData = {
        ...formData,
        assignedSlsTargets: assignedSlsTargets
      };

      if (editingId) {
        const userRef = doc(db, "users", editingId);
        await updateDoc(userRef, { ...finalData, updatedAt: serverTimestamp() });
        setEditingId(null);
      } else {
        await addDoc(collection(db, "users"), {
          ...finalData,
          mustChangePassword: true,
          createdAt: serverTimestamp(),
          lastLogin: null
        });
        setIsAdding(false);
      }
      setFormData({ role: "ppl" });
      setAssignedSlsTargets([]);
    } catch (err) {
      handleFirestoreError(err, "write", "users");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus user ini?")) return;
    try {
      await deleteDoc(doc(db, "users", id));
    } catch (err) {
      handleFirestoreError(err, "delete", "users");
    }
  };

  const startEdit = (user: UserRecord) => {
    setFormData(user);
    setAssignedSlsTargets(user.assignedSlsTargets || []);
    setEditingId(user.id);
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.district?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Top Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200/50">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans text-glow uppercase">Personnel Directory</h2>
          <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase tracking-widest">Enterprise Access Control • SE2026 Admin Panel</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2.5 px-4 py-3 bg-white text-slate-700 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-200/60 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-premium"
          >
            <Download size={14} className="text-primary-600 animate-bounce" /> Get Template
          </button>
          
          <div className="relative overflow-hidden inline-block group rounded-xl">
            <button className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50/50 text-emerald-700 rounded-xl text-[9px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100/60 transition-all shadow-premium cursor-pointer">
              <Upload size={14} /> {isUploading ? `Uploading ${uploadProgress}%` : 'Import CSV'}
            </button>
            <input
              type="file"
              accept=".csv"
              disabled={isUploading}
              onChange={handleFileUpload}
              className="absolute left-0 top-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <button
            onClick={() => { setIsAdding(true); setAssignedSlsTargets([]); }}
            className="flex items-center gap-2.5 px-6 py-3 bg-slate-950 hover:bg-primary-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-premium hover:shadow-glow-blue transition-all active:scale-[0.98] btn-hover-effect cursor-pointer"
          >
            <UserPlus size={14} /> Register Officer
          </button>
        </div>
      </div>

      {/* Directory Search & Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="md:col-span-3 flex items-center bg-white border border-slate-200/60 rounded-xl shadow-premium focus-within:ring-4 focus-within:ring-primary-500/5 focus-within:border-primary-400 transition-all group overflow-hidden">
          <Search className="ml-5 text-slate-400 group-focus-within:text-primary-500 transition-colors pointer-events-none" size={16} />
          <input
            type="text"
            placeholder="Search by Name, Identification, or District..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3.5 pr-6 py-4 bg-transparent outline-none text-xs font-bold text-slate-700 placeholder:text-slate-400"
          />
        </div>
        <div className="glass-card rounded-xl p-5 border border-primary-100/50 flex flex-col justify-center bg-primary-50/10">
          <span className="text-[8px] font-black uppercase tracking-[0.25em] text-primary-600 mb-1">Authenticated Units</span>
          <span className="text-2xl font-extrabold text-slate-900 font-sans tracking-tight">{users.length} <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">UIDs</span></span>
        </div>
      </div>

      {/* Modern Saas Datagrid */}
      <div className="glass-card rounded-[2rem] overflow-hidden border border-white/40 shadow-premium">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Identitas Mitra</th>
                <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Kredensial</th>
                <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Wilayah Kerja & HP</th>
                <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Target Operasional SLS</th>
                <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <motion.tr
                      layout
                      key={user.id}
                      className="hover:bg-primary-50/30 transition-all group duration-150"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-50 to-white text-primary-700 flex items-center justify-center font-black text-sm border border-primary-100/50 shadow-sm shrink-0">
                            {user.name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 leading-tight mb-1.5 font-sans">{user.name.toUpperCase()}</p>
                            <span className={`inline-block px-2.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider shadow-sm ${
                              user.role === 'admin' 
                                ? 'bg-slate-950 text-white' 
                                : user.role === 'pml' 
                                  ? 'bg-primary-600 text-white shadow-glow-blue' 
                                  : 'bg-slate-100 text-slate-600'
                            }`}>{user.role || 'PPL'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Shield size={12} className="text-primary-500" />
                            <span className="text-xs font-bold text-slate-700 font-sans">{user.username}</span>
                          </div>
                          <div className="flex items-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <Key size={12} className="text-amber-500" />
                            <span className="text-[10px] font-mono font-bold tracking-[0.25em]">{user.password?.replace(/./g, '•')}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <MapPin size={12} className="text-primary-500 shrink-0" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide">
                              {user.district} • {user.desa}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Database size={11} className="text-slate-400 shrink-0" />
                            <span className="text-[10px] font-mono font-bold text-slate-500">{user.subSlsName || user.subSls || "-"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone size={12} className="text-emerald-500 shrink-0" />
                            <span className="text-[10px] font-mono font-bold text-slate-500">{user.phoneNumber}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-2 max-w-[220px]">
                          {user.assignedSlsTargets && user.assignedSlsTargets.length > 0 ? (
                            <>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Database size={11} className="text-primary-600" />
                                <span className="text-[9px] font-black text-slate-700 uppercase tracking-wider">{user.assignedSlsTargets.length} SLS Dialokasikan</span>
                              </div>
                              <div className="space-y-2">
                                {user.assignedSlsTargets.map((target: any, idx: number) => {
                                  const pct = Math.min(100, Math.round((target.realisasi / (target.target || 150)) * 100));
                                  return (
                                    <div key={idx} className="bg-slate-50 border border-slate-200/40 rounded-lg p-2 space-y-1">
                                      <div className="flex items-center justify-between text-[8px] font-black font-mono text-slate-700">
                                        <span className="text-primary-700 font-bold">SLS {target.idsls.slice(-4)}</span>
                                        <span>{pct}% ({target.realisasi}/{target.target})</span>
                                      </div>
                                      <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                                        <div 
                                          className={`h-full rounded-full transition-all duration-500 ${
                                            pct >= 100 
                                              ? "bg-emerald-500 shadow-glow-emerald" 
                                              : pct >= 50 
                                                ? "bg-primary-500 shadow-glow-blue" 
                                                : "bg-amber-500 shadow-glow-amber"
                                          }`} 
                                          style={{ width: `${pct}%` }} 
                                        />
                                      </div>
                                      {target.deadline && (
                                        <p className="text-[7px] text-slate-400 font-bold uppercase tracking-wider text-right font-mono">Until: {target.deadline}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                              <Database size={14} className="text-slate-300 mb-1" />
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Belum Ada Target</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <button
                            onClick={() => startEdit(user)}
                            className="p-2 hover:bg-primary-50 rounded-lg text-primary-600 transition-colors cursor-pointer"
                            title="Edit Profile"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-2 hover:bg-rose-50 rounded-lg text-rose-500 transition-colors cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-xs font-semibold uppercase tracking-widest">
                      Tidak ada petugas terdaftar
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal Overlay */}
      <AnimatePresence>
        {(isAdding || editingId) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-[2.5rem] shadow-premium w-full max-w-5xl overflow-hidden border border-slate-200"
            >
              <div className="bg-slate-950 p-6 text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-[65px] -mr-16 -mt-16 pointer-events-none" />
                <div className="relative z-10">
                  <h3 className="text-sm font-extrabold uppercase tracking-wide font-sans">
                    {editingId ? "Edit Personnel Profile" : "Register New Personnel"}
                  </h3>
                  <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-[0.2em]">Authentication & Field Assignment</p>
                </div>
                <button
                  onClick={() => { setIsAdding(false); setEditingId(null); setFormData({ role: 'ppl' }); setAssignedSlsTargets([]); }}
                  className="p-2.5 hover:bg-white/10 rounded-xl transition-all relative z-10 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 space-y-8 bg-white max-h-[75vh] overflow-y-auto custom-scrollbar">
                {/* 2-Column top panel */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Column 1: Profil & Cakupan Wilayah Tugas */}
                  <div className="space-y-5">
                    <h4 className="text-[10px] font-black text-primary-600 uppercase tracking-widest flex items-center gap-2">
                      <Layers size={12} />
                      Profil & Cakupan Wilayah Tugas
                    </h4>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                      <input
                        type="text"
                        value={formData.name || ""}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. BUDI SANTOSO"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp Number</label>
                      <input
                        type="text"
                        value={formData.phoneNumber || ""}
                        onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                        placeholder="e.g. 628123456789"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Kecamatan</label>
                        <div className="relative">
                          <select
                            value={formData.district || ""}
                            onChange={e => setFormData({ ...formData, district: e.target.value, desa: "", subSls: "" })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="">Pilih Kecamatan</option>
                            {Object.keys(geoHierarchy).sort().map(k => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Desa / Kelurahan</label>
                        <div className="relative">
                          <select
                            disabled={!formData.district}
                            value={formData.desa || ""}
                            onChange={e => setFormData({ ...formData, desa: e.target.value, subSls: "" })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm disabled:opacity-40 appearance-none cursor-pointer"
                          >
                            <option value="">Pilih Desa</option>
                            {formData.district && geoHierarchy[formData.district] &&
                              Object.keys(geoHierarchy[formData.district]).sort().map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))
                            }
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Main Sub SLS / Blok Sensus</label>
                      <div className="relative">
                        <select
                          disabled={!formData.desa}
                          value={formData.subSls || ""}
                          onChange={e => {
                            const selectedId = e.target.value;
                            const slsList = formData.district && formData.desa && geoHierarchy[formData.district]?.[formData.desa];
                            const found = slsList?.find((s: any) => s.id === selectedId);
                            setFormData({ ...formData, subSls: selectedId, subSlsName: found ? `${found.name} — ${formData.desa}` : "" });
                          }}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm disabled:opacity-40 appearance-none cursor-pointer"
                        >
                          <option value="">Pilih Sub SLS</option>
                          {formData.district && formData.desa && geoHierarchy[formData.district]?.[formData.desa] &&
                            geoHierarchy[formData.district][formData.desa].map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name} — {formData.desa}</option>
                            ))
                          }
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Akun & Keamanan Akses */}
                  <div className="space-y-5">
                    <h4 className="text-[10px] font-black text-primary-600 uppercase tracking-widest flex items-center gap-2">
                      <Shield size={12} />
                      Akun & Keamanan Akses
                    </h4>

                    <div className="bg-slate-50 p-6 rounded-2xl space-y-4.5 border border-slate-200/50">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Unique Username</label>
                        <input
                          type="text"
                          value={formData.username || ""}
                          onChange={e => setFormData({ ...formData, username: e.target.value })}
                          placeholder="e.g. budi_ppl"
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 transition-all shadow-sm font-mono"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Role</label>
                          <div className="relative">
                            <select
                              value={formData.role || "ppl"}
                              onChange={e => setFormData({ ...formData, role: e.target.value as any })}
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 transition-all shadow-sm appearance-none cursor-pointer"
                            >
                              <option value="ppl">PPL (Field Officer)</option>
                              <option value="pml">PML (Supervisor)</option>
                              <option value="admin">Administrator</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Initial Password</label>
                          <input
                            type="text"
                            value={formData.password || ""}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            placeholder="Initial login secret"
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 transition-all shadow-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100 flex items-start gap-3">
                      <Shield size={14} className="text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-[9px] font-black text-amber-800 leading-relaxed uppercase tracking-wide">
                        Petugas wajib mengganti password default saat pertama kali mengakses aplikasi.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section 4: Alokasi Target & Progres SLS */}
                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[10px] font-black text-primary-600 uppercase tracking-widest flex items-center gap-2">
                        <Database size={14} />
                        Alokasi Target & Progres SLS
                      </h4>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        Tugaskan satu atau beberapa SLS beserta target beban usaha & batas waktu pencacahan
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!formData.district || !formData.desa}
                      onClick={() => {
                        const activeSlsList = formData.district && formData.desa && geoHierarchy[formData.district]?.[formData.desa] || [];
                        const nextSls = activeSlsList[assignedSlsTargets.length] || activeSlsList[0] || { id: "", name: "" };
                        setAssignedSlsTargets([
                          ...assignedSlsTargets,
                          {
                            idsls: nextSls.id || "",
                            nmsls: nextSls.name ? `${nextSls.name} — ${formData.desa}` : "",
                            target: 150,
                            realisasi: 0,
                            progressPct: 0,
                            deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                          }
                        ]);
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 bg-primary-50 text-primary-700 hover:bg-primary-600 hover:text-white disabled:opacity-40 disabled:hover:bg-primary-50 disabled:hover:text-primary-700 rounded-xl text-[9px] font-black uppercase tracking-widest border border-primary-100 cursor-pointer transition-all shadow-sm"
                    >
                      <Plus size={12} /> Tambah SLS Target
                    </button>
                  </div>

                  {!formData.district || !formData.desa ? (
                    <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <MapPin size={20} className="text-slate-300 mb-2 animate-bounce" />
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Harap Pilih Kecamatan & Desa Terlebih Dahulu</p>
                      <p className="text-[8px] text-slate-400 mt-1 uppercase tracking-widest">Alokasi SLS Target akan memuat list wilayah berdasarkan Desa kerja petugas</p>
                    </div>
                  ) : assignedSlsTargets.length > 0 ? (
                    <div className="space-y-3 bg-slate-50 p-6 rounded-2xl border border-slate-200/50">
                      {assignedSlsTargets.map((item, idx) => {
                        const activeSlsList = formData.district && formData.desa && geoHierarchy[formData.district]?.[formData.desa] || [];
                        const pct = Math.min(100, Math.round((item.realisasi / (item.target || 150)) * 100));

                        return (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-white p-4 rounded-xl border border-slate-200/40 shadow-sm transition-all hover:border-primary-300">
                            {/* SLS Select */}
                            <div className="md:col-span-4 space-y-1">
                              <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Pilih SLS Target</label>
                              <div className="relative">
                                <select
                                  value={item.idsls}
                                  onChange={e => {
                                    const id = e.target.value;
                                    const found = activeSlsList.find((s: any) => s.id === id);
                                    const updated = [...assignedSlsTargets];
                                    updated[idx] = {
                                      ...item,
                                      idsls: id,
                                      nmsls: found ? `${found.name} — ${formData.desa}` : ""
                                    };
                                    setAssignedSlsTargets(updated);
                                  }}
                                  className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 outline-none focus:border-primary-500 appearance-none cursor-pointer"
                                >
                                  <option value="">Pilih SLS</option>
                                  {activeSlsList.map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.name} — {s.id.slice(-4)}</option>
                                  ))}
                                  {item.idsls && !activeSlsList.some((s: any) => s.id === item.idsls) && (
                                    <option value={item.idsls}>{item.nmsls || item.idsls}</option>
                                  )}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={10} />
                              </div>
                            </div>

                            {/* Target Count */}
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Target Usaha</label>
                              <input
                                type="number"
                                value={item.target}
                                min={1}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 1;
                                  const updated = [...assignedSlsTargets];
                                  updated[idx] = {
                                    ...item,
                                    target: val,
                                    progressPct: Math.min(100, Math.round((item.realisasi / val) * 100))
                                  };
                                  setAssignedSlsTargets(updated);
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 outline-none focus:border-primary-500"
                              />
                            </div>

                            {/* Realisasi Count */}
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Realisasi (Realtime)</label>
                              <input
                                type="number"
                                value={item.realisasi}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 0;
                                  const updated = [...assignedSlsTargets];
                                  updated[idx] = {
                                    ...item,
                                    realisasi: val,
                                    progressPct: Math.min(100, Math.round((val / (item.target || 150)) * 100))
                                  };
                                  setAssignedSlsTargets(updated);
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 outline-none focus:border-primary-500 font-mono"
                              />
                            </div>

                            {/* Deadline */}
                            <div className="md:col-span-3 space-y-1">
                              <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Deadline Penyelesaian</label>
                              <input
                                type="date"
                                value={item.deadline}
                                onChange={e => {
                                  const updated = [...assignedSlsTargets];
                                  updated[idx] = { ...item, deadline: e.target.value };
                                  setAssignedSlsTargets(updated);
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 outline-none focus:border-primary-500 font-mono"
                              />
                            </div>

                            {/* Actions */}
                            <div className="md:col-span-1 flex justify-end pt-3 md:pt-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setAssignedSlsTargets(assignedSlsTargets.filter((_, i) => i !== idx));
                                }}
                                className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-100 rounded-lg transition-all cursor-pointer"
                                title="Hapus Alokasi Target"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <Database size={24} className="text-slate-300 mb-2 animate-pulse" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Belum Ada Target SLS Yang Dialokasikan</p>
                      <p className="text-[8px] text-slate-400 mt-1 uppercase tracking-widest">Klik "Tambah SLS Target" di atas untuk menugaskan wilayah pencacahan.</p>
                    </div>
                  )}
                </div>

                {/* Modal Footer actions */}
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                  <button
                    onClick={() => { setIsAdding(false); setEditingId(null); setFormData({ role: 'ppl' }); setAssignedSlsTargets([]); }}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all btn-hover-effect cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isLoadingGeo}
                    className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-premium hover:shadow-glow-blue transition-all btn-hover-effect cursor-pointer animate-pulse"
                  >
                    {editingId ? "Update Account" : "Register Personnel"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { Dashboard } from "./components/Dashboard";
import { SpatialDashboard } from "./components/SpatialDashboard";
import { WhatsAppSimulator } from "./components/WhatsAppSimulator";
import { UserManagement } from "./components/UserManagement";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard";
import { Login } from "./components/SSOLogin";
import { db } from "./lib/firebase";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { LayoutDashboard, MessageSquare, LogOut, ShieldCheck, Bell, X, AlertTriangle, CheckCircle2, Globe, Users, KeyRound, Lock, Eye, EyeOff, Loader2, ChevronRight, ChevronLeft, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { handleFirestoreError } from "./lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

interface Notification {
  id: string;
  type: "NEW_REPORT" | "VERIFICATION_REQUIRED";
  title: string;
  message: string;
  timestamp: any;
  read: boolean;
}

// Error Boundary to prevent entire app crash
class ErrorBoundary extends Component<{ children: ReactNode; fallbackKey?: string }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  componentDidUpdate(prevProps: any) {
    if (prevProps.fallbackKey !== this.props.fallbackKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-10 text-center z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-[2.5rem] p-10 max-w-md shadow-premium border-red-200/50 bg-white/85 text-center relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500" />
            <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-glow-rose">
              <AlertTriangle className="text-rose-500" size={28} />
            </div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight font-sans mb-2">Terjadi Kesalahan Sistem</h3>
            <p className="text-xs text-slate-500 font-medium mb-5 leading-relaxed">Aplikasi mengalami kendala rendering pada komponen aktif. Silakan hubungi admin utama atau muat ulang modul.</p>
            <div className="text-[10px] text-rose-600 font-mono bg-rose-50/50 border border-rose-100/50 p-4 rounded-xl mb-6 break-all max-h-36 overflow-y-auto text-left custom-scrollbar leading-relaxed">
              {this.state.error?.message || "Unknown rendering exception error"}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all btn-hover-effect shadow-premium cursor-pointer"
            >
              Coba Lagi
            </button>
          </motion.div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "spatial" | "whatsapp" | "users" | "analytics">("dashboard");
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toast, setToast] = useState<Notification | null>(null);

  // Change password modal state
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changePwError, setChangePwError] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  useEffect(() => {
    // Check if user is saved in localStorage
    const savedUser = localStorage.getItem("se2026_custom_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUserProfile(parsed);
        // Set default tab based on role
        if (parsed.role === "admin") {
          setActiveTab("dashboard");
        } else {
          setActiveTab("whatsapp");
        }
      } catch (e) {
        localStorage.removeItem("se2026_custom_user");
      }
    }
    setLoading(false);
  }, []);

  const isAdmin = userProfile?.role === "admin";
  const isLoggedIn = !!userProfile;

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;

    // Real-time notifications listener - ONLY for Admins
    const q = query(
      collection(db, "notifications"),
      orderBy("timestamp", "desc"),
      limit(5)
    );

    const unsubscribeNotifs = onSnapshot(q, (snapshot) => {
      const newNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));

      const latest = newNotifs[0];
      if (latest && !latest.read) {
        const now = Date.now();
        const notifTime = latest.timestamp instanceof Timestamp ? latest.timestamp.toMillis() : now;
        if (now - notifTime < 30000) {
          setToast(latest);
          setTimeout(() => setToast(null), 5000);
        }
      }

      setNotifications(newNotifs);
    }, (error) => {
      try {
        handleFirestoreError(error, "list", "notifications");
      } catch (e: any) {
        console.error("Notif Permission Error:", e.message);
      }
    });

    return () => unsubscribeNotifs();
  }, [isLoggedIn, isAdmin]);

  const handleLoginSuccess = (userData: any) => {
    setUserProfile(userData);
    if (userData.role === "admin") {
      setActiveTab("dashboard");
    } else {
      setActiveTab("whatsapp");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("se2026_custom_user");
    setUserProfile(null);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setChangePwError("Semua field harus diisi.");
      return;
    }
    if (currentPassword !== userProfile?.password) {
      setChangePwError("Password lama salah.");
      return;
    }
    if (newPassword.length < 6) {
      setChangePwError("Password baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangePwError("Konfirmasi password tidak cocok.");
      return;
    }
    if (newPassword === currentPassword) {
      setChangePwError("Password baru harus berbeda dari password lama.");
      return;
    }

    setChangingPw(true);
    setChangePwError("");
    try {
      await updateDoc(doc(db, "users", userProfile.uid), {
        password: newPassword,
        passwordChangedAt: serverTimestamp()
      });
      // Update local state and storage
      const updated = { ...userProfile, password: newPassword };
      setUserProfile(updated);
      localStorage.setItem("se2026_custom_user", JSON.stringify(updated));
      setShowChangePasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      console.error("Change password error:", err);
      setChangePwError("Gagal mengubah password.");
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <motion.div
          animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="p-4 bg-white rounded-3xl shadow-xl">
             <ShieldCheck size={40} className="text-[#007AFF]" />
          </div>
          <div className="text-zinc-400 font-black text-xs uppercase tracking-[0.3em]">
            Loading PantauSE...
          </div>
        </motion.div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Determine which tabs to show based on role
  const roleName = userProfile?.role === "admin" ? "Administrator" :
                   userProfile?.role === "pml" ? "PML" : "PPL";

  return (
    <div className="flex flex-col h-screen overflow-hidden font-sans bg-slate-50">
      {/* Background Mesh */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-primary-200/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-cyan-200/20 rounded-full blur-[150px] translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-blue-200/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Top Navigation Bar */}
      <header className="h-20 glass-panel border-b border-white/50 flex items-center justify-between px-10 shrink-0 z-20 sticky top-0 shadow-sm backdrop-blur-xl">
        <button onClick={() => setActiveTab("dashboard")} className="flex items-center gap-4 cursor-pointer hover:opacity-90 transition-all text-left btn-hover-effect">
          <div className="w-11 h-11 bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl flex items-center justify-center shadow-md shadow-primary-500/20 border border-white/30 shrink-0">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black leading-tight tracking-tight text-slate-900 font-mono">PANTAU<span className="text-primary-600">SE</span> 2026</h1>
            <p className="text-[9px] text-slate-400 font-bold tracking-[0.25em] mt-0.5 uppercase">Enterprise Data Gateway • v2.1</p>
          </div>
        </button>
        
        <div className="flex items-center gap-6">
          {/* Notifications (admin only) */}
          {isAdmin && (
            <div className="relative group">
              <button className="relative p-2.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50/50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100">
                <Bell size={18} />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white shadow-glow-rose"></span>
                )}
              </button>

              <div className="absolute right-0 top-full mt-2 w-80 glass-dropdown rounded-2xl hidden group-hover:block z-50 overflow-hidden shadow-premium">
                <div className="p-4 bg-slate-50/85 border-b border-slate-100 flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Update Terbaru</span>
                  <span className="px-2 py-0.5 bg-primary-50 text-primary-600 text-[8px] font-black uppercase tracking-wider rounded-md">Realtime</span>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div key={n.id} className="p-4 border-b border-slate-100 hover:bg-slate-50/80 transition-all flex gap-3 cursor-pointer">
                        <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${n.type === 'VERIFICATION_REQUIRED' ? 'bg-amber-50 text-amber-600 border border-amber-100/50 shadow-glow-amber' : 'bg-primary-50 text-primary-600 border border-primary-100/50 shadow-glow-blue'}`}>
                          {n.type === 'VERIFICATION_REQUIRED' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-slate-800 leading-tight mb-1 truncate">{n.title}</p>
                          <p className="text-[10px] text-slate-500 leading-relaxed font-medium line-clamp-2">{n.message}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-400 italic font-medium">Belum ada notifikasi</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 bg-white/70 px-3.5 py-1.5 rounded-xl border border-slate-200/50 shadow-sm backdrop-blur-md hover:border-primary-200 transition-colors">
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-black text-slate-900 leading-none mb-1">{userProfile?.name || "Petugas SE2026"}</span>
              <span className="text-[8px] font-bold text-primary-600 uppercase tracking-widest leading-none">{roleName}</span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 text-white flex items-center justify-center font-black text-xs border border-white/20 shadow-sm">
              {userProfile?.name?.[0] || userProfile?.username?.[0] || "?"}
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed top-24 right-10 z-[100] w-80 glass-dropdown rounded-2xl border-l-4 border-primary-500 p-5 flex gap-4 pointer-events-auto"
          >
            <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${toast.type === 'VERIFICATION_REQUIRED' ? 'bg-amber-100 text-amber-600' : 'bg-primary-100 text-primary-600'}`}>
              {toast.type === 'VERIFICATION_REQUIRED' ? <AlertTriangle size={20} /> : <Bell size={20} />}
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-slate-900">{toast.title}</h4>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600 transition-colors self-start mt-1">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden z-10 relative">
        {/* Sidebar Nav */}
        <aside className={`${sidebarMinimized ? 'w-20 px-3' : 'w-72 px-6'} glass-panel border-r border-white/50 flex flex-col py-8 gap-2 transition-all duration-300 relative`}>
          <button 
            onClick={() => setSidebarMinimized(!sidebarMinimized)} 
            className="absolute -right-3 top-10 bg-white border border-slate-200 text-slate-400 rounded-full p-1.5 shadow-premium hover:text-primary-600 transition-colors z-50 cursor-pointer hover:border-primary-200"
          >
            {sidebarMinimized ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
          
          <div className={`text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 transition-all ${sidebarMinimized ? 'text-center text-[7px] px-0' : 'px-4'}`}>
            {sidebarMinimized ? 'MENU' : 'Navigasi Utama'}
          </div>

          <div className="space-y-1.5 flex-1">
            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`w-full flex items-center gap-3.5 py-3 rounded-xl transition-all cursor-pointer btn-hover-effect relative ${
                    activeTab === "dashboard"
                      ? "bg-slate-900 text-white font-black shadow-premium px-5"
                      : "text-slate-500 hover:bg-white hover:text-primary-600 hover:shadow-premium font-bold px-5"
                  } ${sidebarMinimized ? 'justify-center px-0' : ''}`}
                  title="Dashboard"
                >
                  {activeTab === "dashboard" && !sidebarMinimized && (
                    <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-500 rounded-r-full shadow-glow-blue" />
                  )}
                  <LayoutDashboard size={18} className="shrink-0" />
                  {!sidebarMinimized && <span className="text-xs tracking-wide">Dashboard</span>}
                </button>

                <button
                  onClick={() => setActiveTab("users")}
                  className={`w-full flex items-center gap-3.5 py-3 rounded-xl transition-all cursor-pointer btn-hover-effect relative ${
                    activeTab === "users"
                      ? "bg-slate-900 text-white font-black shadow-premium px-5"
                      : "text-slate-500 hover:bg-white hover:text-primary-600 hover:shadow-premium font-bold px-5"
                  } ${sidebarMinimized ? 'justify-center px-0' : ''}`}
                  title="Kelola Petugas"
                >
                  {activeTab === "users" && !sidebarMinimized && (
                    <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-500 rounded-r-full shadow-glow-blue" />
                  )}
                  <Users size={18} className="shrink-0" />
                  {!sidebarMinimized && <span className="text-xs tracking-wide">Kelola Petugas</span>}
                </button>

                <button
                  onClick={() => { setActiveTab("spatial"); setSidebarMinimized(true); }}
                  className={`w-full flex items-center gap-3.5 py-3 rounded-xl transition-all cursor-pointer btn-hover-effect relative ${
                    activeTab === "spatial"
                      ? "bg-slate-900 text-white font-black shadow-premium px-5"
                      : "text-slate-500 hover:bg-white hover:text-primary-600 hover:shadow-premium font-bold px-5"
                  } ${sidebarMinimized ? 'justify-center px-0' : ''}`}
                  title="Peta Spatial"
                >
                  {activeTab === "spatial" && !sidebarMinimized && (
                    <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-500 rounded-r-full shadow-glow-blue" />
                  )}
                  <Globe size={18} className="shrink-0" />
                  {!sidebarMinimized && <span className="text-xs tracking-wide">Peta Spatial</span>}
                </button>

                <button
                  onClick={() => setActiveTab("analytics")}
                  className={`w-full flex items-center gap-3.5 py-3 rounded-xl transition-all cursor-pointer btn-hover-effect relative ${
                    activeTab === "analytics"
                      ? "bg-slate-900 text-white font-black shadow-premium px-5"
                      : "text-slate-500 hover:bg-white hover:text-primary-600 hover:shadow-premium font-bold px-5"
                  } ${sidebarMinimized ? 'justify-center px-0' : ''}`}
                  title="Analytics & Charts"
                >
                  {activeTab === "analytics" && !sidebarMinimized && (
                    <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-500 rounded-r-full shadow-glow-blue" />
                  )}
                  <TrendingUp size={18} className="shrink-0" />
                  {!sidebarMinimized && <span className="text-xs tracking-wide">Analisis Grafik</span>}
                </button>
              </>
            )}

            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`w-full flex items-center gap-3.5 py-3 rounded-xl transition-all cursor-pointer btn-hover-effect relative ${
                activeTab === "whatsapp"
                  ? "bg-slate-900 text-white font-black shadow-premium px-5"
                  : "text-slate-500 hover:bg-white hover:text-primary-600 hover:shadow-premium font-bold px-5"
              } ${sidebarMinimized ? 'justify-center px-0' : ''}`}
              title="Simulator Bot"
            >
              {activeTab === "whatsapp" && !sidebarMinimized && (
                <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary-500 rounded-r-full shadow-glow-blue" />
              )}
              <MessageSquare size={18} className="shrink-0" />
              {!sidebarMinimized && <span className="text-xs tracking-wide">Bot Simulator</span>}
            </button>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-200/40">
            <div className={`bg-gradient-to-b from-slate-950 to-slate-900 rounded-[1.5rem] p-4 text-white relative overflow-hidden group transition-all shadow-premium border border-white/5 ${sidebarMinimized ? 'p-2 flex flex-col items-center' : ''}`}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/10 rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform blur-2xl pointer-events-none" />
              
              {!sidebarMinimized ? (
                <div className="relative z-10">
                  <p className="text-[8px] font-black text-slate-400 mb-2 uppercase tracking-[0.25em]">Mitra Account</p>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow-emerald animate-pulse ring-4 ring-emerald-500/20 shrink-0"></span>
                    <span className="text-xs font-black tracking-tight truncate font-mono">{userProfile?.username || "PETUGAS"}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-4 font-bold truncate">
                    {userProfile?.district || "Kabupaten Asahan"}
                  </p>
                </div>
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-glow-emerald animate-pulse mb-3" />
              )}

              <div className="space-y-1.5 relative z-10 w-full">
                <button
                  onClick={() => setShowChangePasswordModal(true)}
                  className={`w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-white/5 hover:border-white/10 cursor-pointer ${sidebarMinimized ? 'px-0 font-medium' : ''}`}
                  title="Ganti Password"
                >
                  <KeyRound size={13} /> {!sidebarMinimized && "Ganti Password"}
                </button>

                <button
                  onClick={handleLogout}
                  className={`w-full py-2.5 bg-rose-500/10 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/20 hover:border-transparent rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${sidebarMinimized ? 'px-0' : ''}`}
                  title="Keluar Sistem"
                >
                  <LogOut size={13} /> {!sidebarMinimized && "Keluar"}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-10 bg-transparent">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              <ErrorBoundary fallbackKey={activeTab}>
                {activeTab === "dashboard" && isAdmin && <Dashboard isAdmin={isAdmin} />}
                {activeTab === "spatial" && isAdmin && <SpatialDashboard isAdmin={isAdmin} />}
                {activeTab === "analytics" && isAdmin && <AnalyticsDashboard />}
                {activeTab === "whatsapp" && <WhatsAppSimulator userProfile={userProfile} />}
                {activeTab === "users" && isAdmin && <UserManagement />}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showChangePasswordModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-[2rem] shadow-premium w-full max-w-md overflow-hidden border border-slate-100"
            >
              <div className="bg-slate-950 p-6 flex justify-between items-center text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/10 rounded-full -mr-8 -mt-8 blur-xl pointer-events-none" />
                <div className="relative z-10">
                  <h3 className="text-sm font-black uppercase tracking-wider font-mono">Keamanan Akun</h3>
                  <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">Update Password Akses</p>
                </div>
                <button
                  onClick={() => { setShowChangePasswordModal(false); setChangePwError(""); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); }}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password Lama</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type={showCurrentPw ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => { setCurrentPassword(e.target.value); setChangePwError(""); }}
                      placeholder="Masukkan password lama"
                      className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm"
                    />
                    <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password Baru</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type={showNewPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setChangePwError(""); }}
                      placeholder="Minimal 6 karakter"
                      className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm"
                    />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => { setConfirmNewPassword(e.target.value); setChangePwError(""); }}
                      placeholder="Ketik ulang password baru"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 focus:bg-white transition-all shadow-sm"
                    />
                  </div>
                </div>

                {changePwError && (
                  <p className="text-rose-600 text-[10px] font-black text-center bg-rose-50 border border-rose-100 py-2.5 rounded-xl uppercase tracking-wider">{changePwError}</p>
                )}

                <div className="flex gap-3 pt-3">
                  <button
                    onClick={() => { setShowChangePasswordModal(false); setChangePwError(""); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); }}
                    className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all btn-hover-effect cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={changingPw}
                    className="flex-[2] py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-premium hover:shadow-glow-blue disabled:opacity-50 btn-hover-effect cursor-pointer"
                  >
                    {changingPw ? <Loader2 className="animate-spin" size={16} /> : "Simpan Password"}
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

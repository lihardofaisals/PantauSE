import React, { useState } from "react";
import { db, handleFirestoreError } from "../lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { ShieldCheck, Lock, User, Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LoginProps {
  onLoginSuccess: (userData: any) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [loginMode, setLoginMode] = useState<"petugas" | "admin">("petugas");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Force change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username dan password harus diisi.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      // Query by username
      const q = query(
        collection(db, "users"),
        where("username", "==", username.trim())
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // Fallback for default admin if DB is empty or unreachable
        if (loginMode === "admin" && username.trim() === "admin_asahan" && password === "admin123") {
          const fallbackAdmin = {
            uid: "default_admin",
            username: "admin_asahan",
            password: "admin123",
            name: "Admin Asahan (Fallback)",
            role: "admin",
            district: "BPS Asahan",
            mustChangePassword: false
          };
          localStorage.setItem("se2026_custom_user", JSON.stringify(fallbackAdmin));
          onLoginSuccess(fallbackAdmin);
          return;
        }
        setError("Username tidak ditemukan.");
        setIsLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const userDocId = userDoc.id;

      // Check password
      if (userData.password !== password) {
        setError("Password salah.");
        setIsLoading(false);
        return;
      }

      // Check role matches login mode
      if (loginMode === "admin" && userData.role !== "admin") {
        setError("Akun ini bukan administrator.");
        setIsLoading(false);
        return;
      }

      if (loginMode === "petugas" && userData.role === "admin") {
        setError("Akun admin tidak bisa login di sini. Gunakan tab Administrator.");
        setIsLoading(false);
        return;
      }

      // Check if first-time login (must change password)
      if (userData.mustChangePassword === true || userData.mustChangePassword === undefined) {
        // If mustChangePassword field doesn't exist yet, treat as first login
        setPendingUser({ ...userData, uid: userDocId });
        setShowChangePassword(true);
        setIsLoading(false);
        return;
      }

      // Update last login
      await updateDoc(doc(db, "users", userDocId), {
        lastLogin: serverTimestamp()
      });

      // Success - persist and notify parent
      const fullUser = { ...userData, uid: userDocId };
      localStorage.setItem("se2026_custom_user", JSON.stringify(fullUser));
      onLoginSuccess(fullUser);

    } catch (err: any) {
      console.error("Login error:", err);
      // Fallback in catch block too
      if (loginMode === "admin" && username.trim() === "admin_asahan" && password === "admin123") {
        const fallbackAdmin = {
          uid: "default_admin",
          username: "admin_asahan",
          password: "admin123",
          name: "Admin Asahan (Fallback)",
          role: "admin",
          district: "BPS Asahan",
          mustChangePassword: false
        };
        localStorage.setItem("se2026_custom_user", JSON.stringify(fallbackAdmin));
        onLoginSuccess(fallbackAdmin);
        return;
      }
      setError(`Login Error: ${err.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError("Password baru harus diisi.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    if (newPassword === pendingUser?.password) {
      setError("Password baru tidak boleh sama dengan password lama.");
      return;
    }

    setChangingPassword(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", pendingUser.uid), {
        password: newPassword,
        mustChangePassword: false,
        lastLogin: serverTimestamp(),
        passwordChangedAt: serverTimestamp()
      });

      const updatedUser = { ...pendingUser, password: newPassword, mustChangePassword: false };
      localStorage.setItem("se2026_custom_user", JSON.stringify(updatedUser));
      onLoginSuccess(updatedUser);
    } catch (err: any) {
      console.error("Change password error:", err);
      setError("Gagal mengubah password. Coba lagi.");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background neon light clusters */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary-950/40 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-cyan-950/40 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute top-[30%] left-[30%] w-[400px] h-[400px] bg-primary-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Grid Pattern Mesh Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="glass-card rounded-[2.5rem] max-w-md w-full overflow-hidden relative z-10 border border-white/10 shadow-premium shadow-glow-blue"
      >
        {/* Sleek Enterprise Portal Header */}
        <div className="bg-slate-900 p-8 pb-6 flex flex-col items-center text-white relative overflow-hidden border-b border-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-[45px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-[35px] pointer-events-none" />

          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring" }}
            className="bg-slate-950/50 p-4.5 rounded-[1.5rem] mb-4 shadow-2xl border border-white/10"
          >
            <ShieldCheck size={36} className="text-cyan-400 shadow-glow-blue" />
          </motion.div>
          
          <h1 className="text-xl font-extrabold tracking-tight text-center leading-tight font-sans text-glow uppercase">
            PantauSE
            <span className="block text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Sensus Ekonomi 2026</span>
          </h1>
          <p className="text-[8px] text-primary-400 mt-2 font-black tracking-[0.25em] uppercase bg-primary-950/50 px-3 py-1 rounded-md border border-primary-800/30">
            BPS Kabupaten Asahan
          </p>
        </div>

        <AnimatePresence mode="wait">
          {showChangePassword ? (
            <motion.div
              key="change-password"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="p-8 space-y-5 bg-slate-950/50 text-slate-200"
            >
              <div className="bg-blue-950/20 border border-blue-800/30 rounded-2xl p-4 flex gap-4">
                <div className="w-10 h-10 bg-primary-950/40 rounded-xl flex items-center justify-center shrink-0 border border-primary-800/30">
                  <KeyRound size={18} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider mb-1">Ganti Password</h3>
                  <p className="text-[10px] text-slate-400 leading-relaxed uppercase">
                    Ini adalah login pertama Anda. Silakan ganti password default demi keamanan akun.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-4 border border-white/5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Authenticated user</p>
                <p className="text-xs font-bold text-white font-sans leading-none">{pendingUser?.name?.toUpperCase()}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">{pendingUser?.role} • {pendingUser?.district}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password Baru</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                      placeholder="Minimal 6 karakter"
                      className="w-full pl-11 pr-11 py-3 bg-slate-900 border border-white/10 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 transition-all outline-none"
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer">
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                      placeholder="Ketik ulang password baru"
                      className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-red-400 text-[9px] font-black text-center bg-red-950/20 py-2.5 rounded-xl border border-red-900/30 uppercase tracking-wide">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowChangePassword(false); setPendingUser(null); setNewPassword(""); setConfirmPassword(""); setError(""); }}
                  className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer btn-hover-effect"
                >
                  Kembali
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="flex-[2] py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-premium hover:shadow-glow-blue disabled:opacity-50 cursor-pointer active:scale-95 btn-hover-effect"
                >
                  {changingPassword ? <Loader2 className="animate-spin" size={16} /> : "Simpan & Masuk"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="login-form"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className="p-8 space-y-6 bg-slate-950/50 text-slate-200"
            >
              {/* Role Sliding Tabs */}
              <div className="flex bg-slate-900/60 p-1 rounded-xl border border-white/5 relative">
                <button
                  type="button"
                  onClick={() => { setLoginMode("petugas"); setError(""); }}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer relative z-10 ${
                    loginMode === "petugas" ? "text-slate-950 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  PPL / PML
                </button>
                <button
                  type="button"
                  onClick={() => { setLoginMode("admin"); setError(""); }}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer relative z-10 ${
                    loginMode === "admin" ? "text-slate-950 font-black" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Administrator
                </button>
                
                {/* Physical Slide Background Pill */}
                <div 
                  className={`absolute top-1 bottom-1 w-[calc(50%-6px)] bg-white rounded-lg shadow-sm transition-all duration-300 ${
                    loginMode === "petugas" ? "left-1" : "left-[50%]"
                  }`}
                />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    {loginMode === "admin" ? "Username Admin" : "Username Mitra"}
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setError(""); }}
                      placeholder={loginMode === "admin" ? "admin_asahan" : "mitra_01"}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-900 border border-white/10 rounded-xl text-xs font-bold text-white placeholder:text-slate-600 focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-11 py-3.5 bg-slate-900 border border-white/10 rounded-xl text-xs font-bold text-white placeholder:text-slate-600 focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 outline-none transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-red-400 text-[9px] font-black text-center bg-red-950/20 py-2.5 rounded-xl border border-red-900/30 uppercase tracking-wide">{error}</p>}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-slate-100 hover:bg-white text-slate-950 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-premium hover:shadow-glow-blue cursor-pointer mt-5 btn-hover-effect"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : "Masuk Sistem"}
                </button>
              </form>

              {loginMode === "petugas" && (
                <div className="bg-primary-950/20 p-4 rounded-xl border border-primary-800/30">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide leading-relaxed">
                    💡 Password default diberikan oleh admin/KSK Anda. Pada login pertama, Anda wajib mengganti password.
                  </p>
                </div>
              )}

              {loginMode === "admin" && (
                <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide leading-relaxed">
                    🔒 Halaman admin dikhususkan untuk pengawas dan verifikator data. Hubungi admin utama untuk mendapatkan akses.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-4 pb-4 px-8 border-t border-white/5 flex items-center justify-between text-[8px] font-black text-slate-500 uppercase tracking-[0.25em] bg-slate-950">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-glow-emerald" />
            Service Active
          </div>
          <span>V2.6.0-PRO</span>
        </div>
      </motion.div>
    </div>
  );
}

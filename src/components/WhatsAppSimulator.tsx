import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Check, CheckCheck, Menu, Phone, Video, Search, MoreVertical, Smartphone, RotateCcw, ShieldCheck } from "lucide-react";
import { botService, BotResponse } from "../services/botService";
import { motion, AnimatePresence } from "motion/react";
import { db } from "../lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";

interface Message {
  id: string;
  text: string;
  from: "me" | "bot";
  timestamp: Date;
  type?: "text" | "list" | "buttons";
  options?: string[];
}

export function WhatsAppSimulator({ userProfile }: { userProfile?: any }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: `Halo *${userProfile?.name || "Mitra SE"}*! 👋\nSelamat datang di *Asahan Spatial Assistant SE2026*.\n\nSaya asisten digital Anda untuk memudahkan pelaporan dan pemantauan data SLS di lapangan secara real-time.\n\nSilakan pilih menu interaktif di bawah:`,
      from: "bot",
      timestamp: new Date(),
      type: "list",
      options: [
        "1️⃣ LAPOR CAPAIAN SLS",
        "2️⃣ CEK PROGRES SLS",
        "3️⃣ HUBUNGI PENGAWAS",
        "4️⃣ PANDUAN PETUGAS",
        "5️⃣ STATUS TELEMETRI"
      ]
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use logged-in user's phone number, fallback to test number
  const phoneNumber = userProfile?.phoneNumber || "6289912345678";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (customText?: string) => {
    const text = (customText || inputValue).trim();
    if (!text) return;

    const myMessage: Message = {
      id: Date.now().toString(),
      text,
      from: "me",
      timestamp: new Date()
    };

    setMessages(prev => [...prev, myMessage]);
    setInputValue("");
    setIsTyping(true);

    // Process with bot
    try {
      const response = await botService.processMessage(phoneNumber, text);
      
      // Simulate delay
      setTimeout(() => {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.text,
          from: "bot",
          timestamp: new Date(),
          type: response.type,
          options: response.options
        };
        setMessages(prev => [...prev, botMessage]);
        setIsTyping(false);
      }, 1000);
    } catch (err) {
      console.error(err);
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "🚨 Maaf, sistem sedang mengalami gangguan. Silakan coba lagi nanti.",
        from: "bot",
        timestamp: new Date()
      }]);
    }
  };

  const handleOptionClick = (option: string) => {
    handleSend(option);
  };

  const resetChat = async () => {
    setMessages([
      {
        id: Date.now().toString(),
        text: `Halo *${userProfile?.name || "Mitra SE"}*! 👋\nSelamat datang di *Asahan Spatial Assistant SE2026*.\n\nSaya asisten digital Anda untuk memudahkan pelaporan dan pemantauan data SLS di lapangan secara real-time.\n\nSilakan pilih menu interaktif di bawah:`,
        from: "bot",
        timestamp: new Date(),
        type: "list",
        options: [
          "1️⃣ LAPOR CAPAIAN SLS",
          "2️⃣ CEK PROGRES SLS",
          "3️⃣ HUBUNGI PENGAWAS",
          "4️⃣ PANDUAN PETUGAS",
          "5️⃣ STATUS TELEMETRI"
        ]
      }
    ]);
    setInputValue("");
    setIsTyping(false);
    // Reset local simulator session
    botService.resetSession(phoneNumber);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-10 items-stretch h-[calc(100vh-160px)]">
      {/* Description & Configuration Panel */}
      <div className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar flex flex-col justify-between">
        <div className="space-y-8">
          <header>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-glow-emerald" />
              <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.25em] font-sans">Live Sandbox simulator</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans uppercase text-glow leading-tight">WhatsApp reporting</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest leading-relaxed">High-Fidelity Integration Testing Gateway • BPS Asahan</p>
          </header>

          <div className="glass-card p-6 rounded-[2rem] space-y-4 border-white/50 bg-white/40">
            <h4 className="font-black text-slate-800 flex items-center gap-3.5 text-[10px] uppercase tracking-widest">
              <div className="w-8 h-8 bg-slate-950 text-white rounded-2xl flex items-center justify-center shadow-md"><Smartphone size={16} /></div>
              Simulation Guide
            </h4>
            <ul className="text-xs text-slate-500 space-y-3.5 list-none font-bold leading-relaxed">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-2 shrink-0" />
                <span>Kirim pesan apa saja untuk memulai koneksi ke <span className="text-slate-700 font-extrabold font-sans">Bot Logic Engine</span>.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-2 shrink-0" />
                <span>Gunakan <span className="text-primary-600 font-black">Menu Interaktif</span> untuk mempercepat entri laporan SLS terverifikasi.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-2 shrink-0" />
                <span>Seluruh entri data simulasi akan teragregasi langsung di <span className="text-primary-600 font-black">Statistik Realtime</span>.</span>
              </li>
            </ul>
          </div>


          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 glass-card rounded-2xl border border-slate-100">
              <p className="text-[8px] uppercase tracking-widest font-black text-slate-400 mb-1">Engine Status</p>
              <p className="text-xs font-black flex items-center gap-2 text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-glow-emerald" />
                Online Telemetry
              </p>
            </div>
            <div className="p-4 glass-card rounded-2xl border border-slate-100">
              <p className="text-[8px] uppercase tracking-widest font-black text-slate-400 mb-1">Simulation Mode</p>
              <p className="text-xs font-black text-slate-800 uppercase font-sans">Interactive (v4.0)</p>
            </div>
          </div>
        </div>

        <button
          onClick={resetChat}
          className="flex items-center justify-center gap-3 w-full py-4.5 bg-rose-950/10 text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-200/50 rounded-2xl text-[9px] font-black uppercase tracking-[0.25em] transition-all shadow-sm cursor-pointer active:scale-[0.98] btn-hover-effect mt-6"
        >
          <RotateCcw size={16} />
          Reset Neural Session
        </button>
      </div>

      {/* High-Fidelity Smartphone Mockup Frame */}
      <div className="w-full max-w-[390px] bg-slate-950 rounded-[3rem] border-[10px] border-slate-900 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.4)] relative flex flex-col overflow-hidden h-[730px] mx-auto lg:mx-0 ring-1 ring-white/10 shrink-0">
        
        {/* Physical Camera Lens Notch (Dynamic Island Mockup) */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-50 flex items-center justify-between px-3 border border-white/5 shadow-inner">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800 shadow-inner" />
          <div className="w-2 h-2 rounded-full bg-[#05112e] animate-pulse" />
        </div>

        {/* Smartphone Header / Status Bar */}
        <div className="bg-[#075e54] text-white pt-11 pb-4 px-5 flex items-center justify-between shadow-md relative z-20 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center overflow-hidden border border-white/20 shadow-inner">
              <div className="w-full h-full flex items-center justify-center text-[10px] font-black tracking-widest uppercase bg-primary-600">
                BPS
              </div>
            </div>
            <div>
              <p className="font-extrabold text-xs tracking-tight font-sans">GATEWAY CORE v4</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span className="text-[9px] opacity-90 font-black uppercase tracking-widest">Active Status</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3.5 opacity-60">
            <Smartphone size={16} />
            <MoreVertical size={16} />
          </div>
        </div>

        {/* Chat Canvas (Traditional WhatsApp Pattern Backdrop) */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar bg-slate-50 relative"
          style={{ backgroundImage: "url('https://i.pinimg.com/originals/ab/ab/60/abab600f60ab22b07358a30477446e05.jpg')", backgroundSize: "cover" }}
        >
          <div className="flex justify-center my-2.5">
            <p className="bg-[#dcf8c6]/90 text-[8px] px-2.5 py-0.5 rounded-md text-gray-500 shadow-sm uppercase font-black tracking-widest font-mono">Today</p>
          </div>

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex w-full ${m.from === "me" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] rounded-[1.25rem] p-3 shadow-md relative border border-black/5 ${
                  m.from === "me" ? "bg-[#dcf8c6] rounded-tr-none text-slate-800" : "bg-white rounded-tl-none text-slate-800"
                }`}>
                  <p className="text-xs font-semibold leading-relaxed whitespace-pre-wrap">{m.text}</p>
                  
                  {/* Interactive Options list */}
                  {m.type === "list" && m.options && (
                    <div className="mt-3.5 border-t border-slate-200/50 pt-2 space-y-1.5">
                      {m.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleOptionClick(opt)}
                          className="w-full text-left p-2.5 rounded-xl bg-slate-50/50 hover:bg-slate-100/70 border border-slate-100 text-primary-600 text-[10px] font-black uppercase tracking-wider flex items-center justify-between group transition-colors cursor-pointer"
                        >
                          {opt}
                          <ArrowRightSmall />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Interactive Button Elements */}
                  {m.type === "buttons" && m.options && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleOptionClick(opt)}
                          className="flex-1 min-w-[90px] border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.97] shadow-sm cursor-pointer"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-1.5 mt-1.5">
                    <span className="text-[8px] text-slate-400 font-bold font-mono">
                      {m.timestamp.getHours()}:{m.timestamp.getMinutes().toString().padStart(2, "0")}
                    </span>
                    {m.from === "me" && <CheckCheck size={12} className="text-primary-500" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-white/90 backdrop-blur-sm rounded-[1rem] px-4 py-2 border border-slate-100 shadow-sm text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Control Deck */}
        <div className="p-4 bg-slate-100 flex items-center gap-3 border-t border-slate-200/50">
          <div className="flex-1 bg-white rounded-2xl flex items-center px-4.5 py-3 shadow-inner border border-slate-200 focus-within:ring-4 focus-within:ring-primary-500/5 focus-within:border-primary-400 transition-all overflow-hidden">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ketik laporan atau menu..."
              className="flex-1 text-xs bg-transparent outline-none text-slate-700 font-bold placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={() => handleSend()}
            className="w-11 h-11 bg-[#075e54] text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 hover:rotate-6 transition-all hover:bg-[#0b7e71] cursor-pointer"
          >
            <Send size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}

function ArrowRightSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

  app.use(express.json());

  // --- Simulated SSO BPS API ---
  app.get("/api/sso/mock", (req, res) => {
    // Generate a trial user
    const mockUser = {
      nip: "199001012022031001",
      name: "Budi PPL Asahan",
      orgCode: "09", // Asahan Regency
      jobTitle: "PPL Sensus Ekonomi",
      role: "ppl",
      district: "Kisaran Barat"
    };
    res.json(mockUser);
  });

  // --- WhatsApp Simulator API ---
  // In a real app, this would be a webhook from a WhatsApp provider
  app.post("/api/whatsapp/webhook-simulation", async (req, res) => {
    const { from, body } = req.body;
    console.log(`Received WhatsApp from ${from}: ${body}`);
    
    // Here we would typically invoke the Bot logic
    // For this simulation, we'll let the frontend handle the "state machine" transition
    // and just pretend we received it.
    res.json({ status: "received" });
  });

  // --- Simulated SSO BPS Pages ---
  app.get("/mock-sso", (req, res) => {
    res.send(`
      <html>
        <head>
          <title>BPS - Single Sign On</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');
            body { font-family: 'Roboto', sans-serif; background: #e0e0e0; }
            .wave-bg {
              background: #02a3f7;
              background: linear-gradient(180deg, #02a3f7 0%, #0081cc 100%);
              position: relative;
              overflow: hidden;
            }
            .wave-bg-inner {
              position: absolute;
              top: 0;
              bottom: 0;
              width: 100%;
              right: -30%;
              background: white;
              border-radius: 40% 60% 0% 100% / 50% 50% 50% 50%;
              transform: scaleY(1.5);
              z-index: 1;
            }
            .content-left { position: relative; z-index: 2; }
            .content-right { position: relative; z-index: 5; background: white; }
          </style>
        </head>
        <body class="flex items-center justify-center h-screen p-4">
          <div class="max-w-[850px] w-full bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col md:flex-row h-[520px]">
            <!-- Left Side -->
            <div class="md:w-[45%] wave-bg p-10 text-white flex flex-col justify-between">
              <div class="wave-bg-inner"></div>
              
              <div class="content-left space-y-2">
                <div class="flex items-center gap-2">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/2/28/Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg" class="w-10 h-10 invert brightness-0" alt="BPS Logo" />
                  <span class="font-bold text-sm tracking-widest uppercase italic">Badan Pusat Statistik</span>
                </div>
              </div>
              
              <div class="content-left mb-12">
                <h2 class="text-2xl font-bold leading-tight mb-4">SINGLE SIGN-ON BPS</h2>
                <p class="text-sm opacity-90 font-light max-w-[200px]">Enter your ID and Password to continue</p>
              </div>

              <div class="content-left text-[9px] opacity-40 font-mono">
                &copy; 2026 Badan Pusat Statistik
              </div>
            </div>

            <!-- Right Side -->
            <div class="flex-1 content-right p-12 flex flex-col items-center justify-center space-y-10">
              <div class="text-center">
                <h3 class="text-xl font-bold text-[#003d79]">SIGN IN</h3>
                <p class="text-xs font-bold text-[#003d79] tracking-wider mt-1 uppercase">To Access Application</p>
              </div>

              <div class="w-full max-w-[280px] space-y-6">
                <div class="shadow-[0_4px_15px_rgba(0,0,0,0.05)] rounded-full overflow-hidden">
                  <input type="text" id="username" placeholder="Username" class="w-full px-6 py-3 bg-white border-0 text-gray-600 outline-none text-sm placeholder:text-gray-300" />
                </div>
                <div class="shadow-[0_4px_15px_rgba(0,0,0,0.05)] rounded-full overflow-hidden">
                  <input type="password" id="password" placeholder="Password" class="w-full px-6 py-3 bg-white border-0 text-gray-600 outline-none text-sm placeholder:text-gray-300" />
                </div>
                <button onclick="login()" class="w-full bg-[#02a3f7] text-white py-3 rounded-full font-bold shadow-lg shadow-blue-100 hover:bg-blue-600 transition-all active:scale-95 text-sm">
                  Log In
                </button>
              </div>

              <div class="pt-2">
                <p class="text-[9px] text-gray-200 font-bold uppercase tracking-widest">Secure Gateway Service</p>
              </div>
            </div>
          </div>

          <script>
            function login() {
              const username = document.getElementById('username').value;
              if (!username) {
                alert("Silakan masukkan Username");
                return;
              }
              window.location.href = "/auth/callback?code=mock_code_123";
            }
          </script>
        </body>
      </html>
    `);
  });

  app.get("/auth/callback", (req, res) => {
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS',
                user: {
                  nip: "199001012022031001",
                  nipBaru: "199001012022031001",
                  name: "Budi PPL Asahan",
                  kodeKabupaten: "09",
                  role: "admin",
                  district: "Kisaran Barat",
                  email: "bps08asahan@gmail.com"
                }
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>SSO Successful. Redirecting...</p>
        </body>
      </html>
    `);
  });

  // --- Vite Middleware for Development ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

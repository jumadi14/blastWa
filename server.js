// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server as IOServer } from "socket.io";

// === Load Routes ===
import authRoutes from "./routes/authRoutes.js"; // 🔐 Tambahan route login
import deviceRoutes from "./routes/deviceRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import inboxRoutes from "./routes/inboxRoutes.js";
import sentRoutes from "./routes/sentRoutes.js";
import schedulerRoutes from "./routes/schedulerRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js"; // 🔹 Dashboard route

// === Services ===
import {
  autoReconnectDevices,
  setSocketIO,
} from "./services/whatsappService.js";
import { processDueTasks } from "./services/schedulerService.js";

// === Load environment variables ===
dotenv.config();

// === Initialize App & Server ===
const app = express();
const PORT = 5000;
const HOST = "0.0.0.0";

// === Middleware ===
// HAPUS cors() lama, ganti dengan blok ini
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  // INI KUNCINYA: Menjawab browser saat dia "cek ombak" (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === API Routes ===
app.use("/api/auth", authRoutes); // ✅ LOGIN API AKTIF
app.use("/api/device", deviceRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/template", templateRoutes);
app.use("/api/inbox", inboxRoutes);
app.use("/api/sent", sentRoutes);
app.use("/api/scheduler", schedulerRoutes);
app.use("/api/dashboard", dashboardRoutes);

// === Root Endpoint ===
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Blast Jumadi Backend is running...");
});

// === 404 Handler ===
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `404 Not Found. Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
});

// === Setup Socket.IO ===
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
setSocketIO(io);

// === Jalankan Server ===
server.listen(PORT, HOST, async () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  console.log(`✅ Socket.IO running`);

  // try {
  // await autoReconnectDevices();
  //} catch (err) {
  //console.error("❌ Error saat auto-reconnect devices:", //err.message);
  //}

  // === Scheduler Worker ===
  console.log(
    "⏱️ Scheduler Worker aktif. Memulai check pertama dan loop 30 detik.",
  );

  // 1️⃣ Panggil langsung untuk memastikan tugas jatuh tempo langsung dikirim
  processDueTasks();

  // 2️⃣ Jalankan ulang setiap 30 detik
  setInterval(processDueTasks, 30000);
});

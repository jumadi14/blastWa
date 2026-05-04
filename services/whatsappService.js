// services/whatsappService.js — Baileys Edition
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import pino from "pino";
import db from "../models/db.js";

// ======================================================
// 🔧 SETUP DASAR
// ======================================================
const clients = new Map();   // deviceId → socket
const qrCodes = new Map();   // deviceId → qr string
let io = null;

// Folder tempat simpan session per device
const AUTH_DIR = path.join(process.cwd(), "baileys_auth");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// Logger minimal — ganti ke pino() kalau butuh debug penuh
const logger = pino({ level: "silent" });

// ======================================================
// 🔌 SOCKET.IO
// ======================================================
export function setSocketIO(socketIoInstance) {
  io = socketIoInstance;
  console.log("✅ Socket.IO berhasil dihubungkan ke WhatsApp Service.");
}

export function getWAChatClient(deviceId) {
  return clients.get(deviceId);
}

// ======================================================
// 🧩 UPDATE STATUS DEVICE
// ======================================================
async function updateDeviceStatus(deviceId, newStatus, phoneNumber = null) {
  try {
    if (phoneNumber) {
      await db.run(
        `UPDATE Devices SET status = ?, phoneNumber = ? WHERE deviceId = ?`,
        [newStatus, phoneNumber, deviceId]
      );
    } else {
      await db.run(`UPDATE Devices SET status = ? WHERE deviceId = ?`, [
        newStatus,
        deviceId,
      ]);
    }
    console.log(`[DB SUCCESS] Status device ${deviceId} → ${newStatus}`);
    if (io) io.emit("device-status", { deviceId, status: newStatus, phoneNumber });
  } catch (err) {
    console.error(`[DB ERROR] Gagal update status ${deviceId}:`, err.message);
  }
}

// ======================================================
// 💾 SIMPAN PESAN MASUK
// ======================================================
async function saveInboxMessage(deviceId, msg) {
  try {
    const jid = msg.key.remoteJid || "";
    if (
      jid.endsWith("@g.us") ||
      jid.endsWith("@broadcast") ||
      jid === "status@broadcast" ||
      msg.key.fromMe
    ) return;

    // Ambil nomor bersih
    const fromNumber = jid.split("@")[0].replace(/\D/g, "");
    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      "[Media]";

    await db.run(
      `INSERT INTO Inbox (deviceId, fromNumber, body, timestamp, isRead)
       VALUES (?, ?, ?, ?, 0)`,
      [deviceId, fromNumber, body, Math.floor(Date.now() / 1000)]
    );
    console.log(`[DB SUCCESS] Masuk dari: ${fromNumber}`);
  } catch (err) {
    console.error(`❌ Gagal simpan inbox:`, err.message);
  }
}

// ======================================================
// 💾 SIMPAN PESAN KELUAR
// ======================================================
async function saveOutboxMessage(deviceId, toNumber, body, status, msgId, scheduleId = null) {
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    await db.run(
      `INSERT INTO Messages (deviceId, toNumber, body, timestamp, status, messageId, scheduleId)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         messageId = VALUES(messageId),
         timestamp = VALUES(timestamp),
         scheduleId = VALUES(scheduleId)`,
      [deviceId, toNumber, body, timestamp, status, msgId, scheduleId]
    );
  } catch (err) {
    console.error(`❌ DB Error: Gagal simpan pesan keluar:`, err.message);
  }
}

// ======================================================
// ⚙️ CREATE SESSION — CORE FUNCTION
// ======================================================
export async function createSession(deviceId) {
  console.log(`🚀 Menginisialisasi session Baileys: ${deviceId}`);

  // Cegah duplikat
  if (clients.has(deviceId)) {
    console.log(`⚠️ Session ${deviceId} sudah aktif, skip.`);
    return { success: true, deviceId };
  }

  // Setup device di DB
  try {
    const existing = await db.get(
      `SELECT deviceId FROM Devices WHERE deviceId = ?`,
      [deviceId]
    );
    if (!existing) {
      await db.run(
        `INSERT INTO Devices (deviceId, status, createdAt)
         VALUES (?, 'initializing', ?)
         ON DUPLICATE KEY UPDATE status = 'initializing'`,
        [deviceId, Math.floor(Date.now() / 1000)]
      );
    } else {
      await updateDeviceStatus(deviceId, "initializing");
    }
  } catch (err) {
    console.error(`[DB ERROR] Setup device gagal:`, err.message);
  }

  // Folder auth per device
  const deviceAuthDir = path.join(AUTH_DIR, deviceId);
  if (!fs.existsSync(deviceAuthDir)) fs.mkdirSync(deviceAuthDir, { recursive: true });

  const startSocket = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(deviceAuthDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: true,       // QR tampil di terminal juga
      browser: ["WA Blast", "Chrome", "1.0.0"],
      syncFullHistory: false,        // Hemat memory — tidak perlu history lama
      generateHighQualityLinkPreview: false,
    });

    clients.set(deviceId, sock);

    // ── Event: connection.update ───────────────────────
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR tersedia → kirim ke frontend
      if (qr) {
        console.log(`[QR] Device ${deviceId} — scan QR`);
        qrCodes.set(deviceId, qr);
        await updateDeviceStatus(deviceId, "QR");
        if (io) io.emit("qr-code", { deviceId, qr });
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        clients.delete(deviceId);
        qrCodes.delete(deviceId);

        console.log(`✖️ ${deviceId} terputus. Reason: ${reason}`);

        // 401 = logged out / session dihapus dari HP
        if (reason === DisconnectReason.loggedOut) {
          console.log(`🚫 ${deviceId} logged out. Hapus session lokal.`);
          await updateDeviceStatus(deviceId, "disconnected");
          // Hapus folder auth agar scan ulang bersih
          try {
            fs.rmSync(deviceAuthDir, { recursive: true, force: true });
          } catch (_) {}
          return; // Jangan reconnect
        }

        // Selain loggedOut → reconnect otomatis
        await updateDeviceStatus(deviceId, "disconnected");
        console.log(`🔄 Reconnect ${deviceId} dalam 5 detik...`);
        setTimeout(() => startSocket(), 5000);
      }

      if (connection === "open") {
        console.log(`✅ ${deviceId} CONNECTED & READY`);
        qrCodes.delete(deviceId);
        const phoneNumber = sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0] || null;
        await updateDeviceStatus(deviceId, "READY", phoneNumber);
      }
    });

    // ── Event: simpan credentials ─────────────────────
    sock.ev.on("creds.update", saveCreds);

    // ── Event: pesan masuk ────────────────────────────
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        await saveInboxMessage(deviceId, msg);
      }
    });

    return sock;
  };

  try {
    await startSocket();
    return { success: true, deviceId };
  } catch (err) {
    console.error(`❌ Gagal init ${deviceId}:`, err.message);
    await updateDeviceStatus(deviceId, "disconnected");
    clients.delete(deviceId);
    throw err;
  }
}

// ======================================================
// 🧾 GET QR CODE (polling max 60 detik)
// ======================================================
export async function getQRCode(deviceId) {
  for (let i = 0; i < 30; i++) {
    const qr = qrCodes.get(deviceId);
    if (qr) return qr;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("QR belum tersedia atau sudah expired (timeout 60 detik).");
}

// ======================================================
// ✉️ KIRIM PESAN (TEXT / IMAGE)
// ======================================================
export async function sendMessageService(
  deviceId,
  number,
  message,
  imagePath = null,
  scheduleId = null
) {
  const tempId = Date.now().toString();
  // Format nomor: pastikan pakai @s.whatsapp.net
  const plainNumber = number.replace(/\D/g, "");
  const jid = plainNumber.includes("@") ? number : `${plainNumber}@s.whatsapp.net`;

  await saveOutboxMessage(deviceId, plainNumber, message, "PENDING", tempId, scheduleId);

  try {
    const sock = clients.get(deviceId);
    if (!sock) throw new Error("Device belum aktif atau tidak terhubung.");

    // Cek apakah nomor terdaftar di WA
    const [result] = await sock.onWhatsApp(plainNumber);
    if (!result?.exists) {
      console.warn(`🚫 Nomor ${plainNumber} tidak terdaftar di WhatsApp.`);
      await db.run(`UPDATE Messages SET status = ? WHERE messageId = ?`, [
        "NOT_REGISTERED",
        tempId,
      ]);
      return { success: false, message: "Nomor tidak terdaftar di WhatsApp" };
    }

    let sentMsg;

    if (imagePath && fs.existsSync(imagePath)) {
      // Kirim gambar dengan caption
      const imageBuffer = fs.readFileSync(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimetype = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

      sentMsg = await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: message,
        mimetype,
      });
      console.log(`🖼️ Gambar terkirim ke ${plainNumber}`);
    } else {
      // Kirim teks biasa
      sentMsg = await sock.sendMessage(jid, { text: message });
      console.log(`💬 Pesan teks terkirim ke ${plainNumber}`);
    }

    const msgId = sentMsg?.key?.id || tempId;
    await db.run(
      `UPDATE Messages SET status = 'SENT', messageId = ? WHERE messageId = ?`,
      [msgId, tempId]
    );

    return { success: true, message: "Pesan terkirim" };
  } catch (err) {
    await db.run(`UPDATE Messages SET status = 'FAILED' WHERE messageId = ?`, [tempId]);
    console.error(`❌ Gagal kirim ke ${number}:`, err.message);
    throw err;
  }
}

// ======================================================
// 🔁 AUTO RECONNECT — dipanggil saat server start
// ======================================================
export async function autoReconnectDevices() {
  console.log("♻️ Auto reconnect start...");
  try {
    const devices = await listDevices();
    for (const d of devices) {
      if (clients.has(d.deviceId)) {
        console.log(`⏭️ Skip ${d.deviceId} — sudah aktif.`);
        continue;
      }
      // Hanya reconnect device yang punya folder session (pernah login)
      const deviceAuthDir = path.join(AUTH_DIR, d.deviceId);
      if (!fs.existsSync(deviceAuthDir)) {
        console.log(`⏭️ Skip ${d.deviceId} — belum pernah login.`);
        continue;
      }
      try {
        await createSession(d.deviceId);
      } catch (err) {
        console.error(`❌ Gagal reconnect ${d.deviceId}:`, err.message);
      }
    }
  } catch (e) {
    console.error("❌ Auto reconnect error:", e.message);
  }
}

// ======================================================
// 🗑️ DELETE SESSION
// ======================================================
export async function deleteSession(deviceId) {
  try {
    console.log(`⚠️ Menghapus device: ${deviceId}`);

    // 1. Hapus dari DB dulu
    await db.run(`DELETE FROM Devices WHERE deviceId = ?`, [deviceId]);
    await db.run(`DELETE FROM whatsapp_sessions WHERE device_id = ?`, [deviceId]).catch(() => {});
    console.log(`✅ Data ${deviceId} dihapus dari Database.`);

    // 2. Disconnect socket
    const sock = clients.get(deviceId);
    if (sock) {
      try {
        await sock.logout();
      } catch (_) {}
      try {
        sock.end();
      } catch (_) {}
      clients.delete(deviceId);
    }

    // 3. Hapus folder auth
    setTimeout(() => {
      const deviceAuthDir = path.join(AUTH_DIR, deviceId);
      if (fs.existsSync(deviceAuthDir)) {
        try {
          fs.rmSync(deviceAuthDir, { recursive: true, force: true });
          console.log(`📁 Folder auth ${deviceId} dihapus.`);
        } catch (e) {
          console.error(`⚠️ Gagal hapus folder ${deviceId}:`, e.message);
        }
      }
    }, 1000);

    if (io) io.emit("device-status", { deviceId, status: "DELETED" });
    return { success: true };
  } catch (err) {
    console.error(`❌ Gagal hapus session ${deviceId}:`, err.message);
    throw err;
  }
}

// ======================================================
// 📋 LIST DEVICE
// ======================================================
export const listDevices = async () => {
  try {
    return await db.all(`SELECT * FROM Devices ORDER BY createdAt DESC`);
  } catch (err) {
    console.error("❌ Gagal ambil daftar device:", err.message);
    throw err;
  }
};

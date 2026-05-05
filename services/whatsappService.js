// services/whatsappService.js — Baileys Edition + DB Session Storage
import baileys from "@whiskeysockets/baileys";

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  initAuthCreds,
  BufferJSON,
} = baileys;

import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import pino from "pino";
import db from "../models/db.js";

// ======================================================
// 🔧 SETUP DASAR
// ======================================================
const clients = new Map();
const qrCodes = new Map();
let io = null;
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
// 🗄️ DB AUTH STATE — Ganti useMultiFileAuthState dengan DB
// ======================================================
async function useDBAuthState(deviceId) {
  // Helper: baca satu key dari DB
  const readData = async (key) => {
    try {
      const row = await db.get(
        `SELECT session_data FROM whatsapp_sessions WHERE device_id = ?`,
        [`${deviceId}:${key}`]
      );
      if (!row) return null;
      return JSON.parse(row.session_data, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  // Helper: tulis satu key ke DB
  const writeData = async (key, data) => {
    const json = JSON.stringify(data, BufferJSON.replacer);
    await db.run(
      `INSERT INTO whatsapp_sessions (device_id, session_data)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE session_data = VALUES(session_data), updated_at = CURRENT_TIMESTAMP`,
      [`${deviceId}:${key}`, json]
    );
  };

  // Helper: hapus satu key dari DB
  const removeData = async (key) => {
    await db.run(
      `DELETE FROM whatsapp_sessions WHERE device_id = ?`,
      [`${deviceId}:${key}`]
    );
  };

  // Load atau buat credentials baru
  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const val = await readData(`${type}-${id}`);
            if (val) data[id] = val;
          }
          return data;
        },
        set: async (data) => {
          for (const [category, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries || {})) {
              if (value) {
                await writeData(`${category}-${id}`, value);
              } else {
                await removeData(`${category}-${id}`);
              }
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await writeData("creds", creds);
    },
  };
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

    let fromNumber = jid.split("@")[0];

    // ✅ Kalau LID, coba lookup nomor asli via onWhatsApp
    if (jid.endsWith("@lid")) {
  try {
    const sock = clients.get(deviceId);
    if (sock) {
      console.log(`🔍 Lookup LID: ${jid}`);
      const [contact] = await sock.onWhatsApp(jid);
      console.log(`🔍 Result:`, JSON.stringify(contact));
      if (contact?.jid) {
        fromNumber = contact.jid.split("@")[0];
      }
    }
  } catch (e) {
    console.warn(`⚠️ Gagal lookup LID ${jid}:`, e.message);
  }
}

    fromNumber = fromNumber.replace(/\D/g, "");
    if (fromNumber.startsWith("0")) fromNumber = "62" + fromNumber.slice(1);

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.documentMessage?.caption ||
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

 const startSocket = async () => {
  // ✅ Tutup socket lama sebelum buat baru (cegah conflict 440)
  const oldSock = clients.get(deviceId);
  if (oldSock) {
    try { oldSock.end(); } catch (_) {}
    clients.delete(deviceId);
  }

  // ✅ Pakai DB auth state, bukan file
  const { state, saveCreds } = await useDBAuthState(deviceId);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: true,
    browser: ["WA Blast", "Chrome", "1.0.0"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });
    clients.set(deviceId, sock);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

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

        if (reason === DisconnectReason.loggedOut) {
          console.log(`🚫 ${deviceId} logged out. Hapus session dari DB.`);
          await updateDeviceStatus(deviceId, "disconnected");
          // Hapus semua session keys dari DB
          await db.run(
            `DELETE FROM whatsapp_sessions WHERE device_id LIKE ?`,
            [`${deviceId}:%`]
          ).catch(() => {});
          return;
        }

        await updateDeviceStatus(deviceId, "disconnected");
        console.log(`🔄 Reconnect ${deviceId} dalam 5 detik...`);
        setTimeout(() => startSocket(), 5000);
      }

      if (connection === "open") {
        console.log(`✅ ${deviceId} CONNECTED & READY`);
        qrCodes.delete(deviceId);
        const phoneNumber =
          sock.user?.id?.split(":")[0] ||
          sock.user?.id?.split("@")[0] ||
          null;
        await updateDeviceStatus(deviceId, "READY", phoneNumber);
      }
    });

    sock.ev.on("creds.update", saveCreds);

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
  const plainNumber = number.replace(/\D/g, "");
  const jid = plainNumber.includes("@") ? number : `${plainNumber}@s.whatsapp.net`;

  await saveOutboxMessage(deviceId, plainNumber, message, "PENDING", tempId, scheduleId);

  try {
    const sock = clients.get(deviceId);
    if (!sock) throw new Error("Device belum aktif atau tidak terhubung.");

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
      const imageBuffer = fs.readFileSync(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimetype =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" : "image/jpeg";

      sentMsg = await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: message,
        mimetype,
      });
      console.log(`🖼️ Gambar terkirim ke ${plainNumber}`);
    } else {
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

      // ✅ Cek apakah ada session di DB (bukan folder lagi)
      const sessionRow = await db.get(
        `SELECT id FROM whatsapp_sessions WHERE device_id = ?`,
        [`${d.deviceId}:creds`]
      ).catch(() => null);

      if (!sessionRow) {
        console.log(`⏭️ Skip ${d.deviceId} — belum pernah login (tidak ada session di DB).`);
        // Reset status ke disconnected agar frontend tidak tampil READY palsu
        await updateDeviceStatus(d.deviceId, "disconnected");
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

    await db.run(`DELETE FROM Devices WHERE deviceId = ?`, [deviceId]);
    // Hapus semua session keys dari DB
    await db.run(
      `DELETE FROM whatsapp_sessions WHERE device_id LIKE ?`,
      [`${deviceId}:%`]
    ).catch(() => {});
    console.log(`✅ Data ${deviceId} dihapus dari Database.`);

    const sock = clients.get(deviceId);
    if (sock) {
      try { await sock.logout(); } catch (_) {}
      try { sock.end(); } catch (_) {}
      clients.delete(deviceId);
    }

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

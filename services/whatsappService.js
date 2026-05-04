import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import pkg from "whatsapp-web.js";
const { Client, RemoteAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import db from "../models/db.js";

// ======================================================
// 🧹 HELPER: Bersihkan proses Chromium yatim & file lock
// ======================================================
function cleanupSessionLocks(deviceId) {
  const sessionDir = path.join(
    process.cwd(),
    "wwebjs_auth",
    `session-${deviceId}`,
  );

  // 1. Bunuh proses Chromium yang masih memakai profile ini
  try {
    const pattern = `wwebjs_auth/session-${deviceId}`;
    const out = execSync(`pgrep -f "${pattern}" || true`, {
      encoding: "utf8",
    }).trim();
    if (out) {
      const pids = out.split("\n").filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), "SIGKILL");
          console.log(`🪓 Membunuh chromium yatim PID ${pid} (${deviceId})`);
        } catch (e) {
          // proses sudah tidak ada
        }
      }
    }
  } catch (e) {
    // pgrep tidak tersedia / gagal — abaikan
  }

  // 2. Hapus semua file Singleton* yg menyebabkan "profile in use"
  try {
    if (fs.existsSync(sessionDir)) {
      for (const name of fs.readdirSync(sessionDir)) {
        if (name.startsWith("Singleton")) {
          try {
            fs.unlinkSync(path.join(sessionDir, name));
          } catch (_) {}
        }
      }
      const defaultDir = path.join(sessionDir, "Default");
      if (fs.existsSync(defaultDir)) {
        for (const name of fs.readdirSync(defaultDir)) {
          if (name.startsWith("Singleton")) {
            try {
              fs.unlinkSync(path.join(defaultDir, name));
            } catch (_) {}
          }
        }
      }
    }
  } catch (e) {
    console.error(`⚠️ Gagal bersihkan lock ${deviceId}:`, e.message);
  }
}

// ======================================================
// 🔧 SETUP DASAR
// ======================================================

// Simpan QR Code sementara
const qrCodes = new Map();

// Simpan client aktif
const clients = new Map();

// Socket.IO instance
let io = null;

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
// 🔧 SETUP DATABASE SESSION STORAGE (CUSTOM)
// ======================================================

// Fungsi untuk mengambil session dari DB
async function getSessionFromDB(deviceId) {
  const row = await db.get(
    `SELECT session_data FROM whatsapp_sessions WHERE device_id = ?`,
    [deviceId],
  );
  return row ? JSON.parse(row.session_data) : null;
}

// Fungsi untuk simpan/update session ke DB
async function saveSessionToDB(deviceId, sessionData) {
  const dataString = JSON.stringify(sessionData);
  await db.run(
    `INSERT INTO whatsapp_sessions (device_id, session_data) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE session_data = VALUES(session_data), updated_at = CURRENT_TIMESTAMP`,
    [deviceId, dataString],
  );
}

// ======================================================
// 🧩 UPDATE STATUS DEVICE
// ======================================================
async function updateDeviceStatus(deviceId, newStatus, phoneNumber = null) {
  const numberToUpdate = phoneNumber ? phoneNumber.split("@")[0] : null;
  try {
    if (numberToUpdate) {
      await db.run(
        `UPDATE Devices SET status = ?, phoneNumber = ? WHERE deviceId = ?`,
        [newStatus, numberToUpdate, deviceId],
      );
    } else {
      await db.run(`UPDATE Devices SET status = ? WHERE deviceId = ?`, [
        newStatus,
        deviceId,
      ]);
    }

    console.log(`[DB SUCCESS] Status device ${deviceId} → ${newStatus}`);
    if (io)
      io.emit("device-status", {
        deviceId,
        status: newStatus,
        phoneNumber: numberToUpdate,
      });
  } catch (err) {
    console.error(
      `[DB ERROR] Gagal update status device ${deviceId}:`,
      err.message,
    );
  }
}

// ======================================================
// 💾 SIMPAN PESAN (INBOX & OUTBOX)
// ======================================================
async function saveInboxMessage(deviceId, message) {
  try {
    // 1. Ambil kontak secara paksa dari library
    const contact = await message.getContact();

    // 2. Logika pencarian nomor (Cari dari yang paling akurat)
    let finalNumber = "";

    if (contact.number) {
      // Prioritas 1: Nomor HP asli dari objek kontak
      finalNumber = contact.number;
    } else if (message.author) {
      // Prioritas 2: Author (biasanya muncul di grup atau enkripsi baru)
      finalNumber = message.author.split("@")[0].split(":")[0];
    } else {
      // Prioritas 3: Ambil dari ID remote, tapi bersihkan karakternya
      finalNumber = message.from.split("@")[0].split(":")[0];
    }

    // Bersihkan dari semua karakter non-angka (biar sisa 628xxx saja)
    finalNumber = finalNumber.replace(/\D/g, "");

    // 3. JAGA-JAGA: Kalau nomor tetap ID panjang (LID),
    // kita tambahkan Nama di depannya supaya kamu kenal
    const senderName = message._data.notifyName || "";
    let displayInDb = finalNumber;

    if (finalNumber.length > 15 && senderName) {
      displayInDb = `${senderName} (${finalNumber.substring(0, 5)}...)`;
    }

    await db.run(
      `INSERT INTO Inbox (deviceId, fromNumber, body, timestamp, isRead)
       VALUES (?, ?, ?, ?, 0)`,
      [deviceId, displayInDb, message.body, Math.floor(Date.now() / 1000)],
    );

    console.log(`[DB SUCCESS] Masuk dari: ${displayInDb}`);
  } catch (err) {
    console.error(`❌ Gagal simpan inbox:`, err.message);
  }
}

async function saveOutboxMessage(
  deviceId,
  toNumber,
  body,
  status,
  msgId,
  scheduleId = null,
) {
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
      [deviceId, toNumber, body, timestamp, status, msgId, scheduleId],
    );
    console.log(`[DB SUCCESS] Outbox ke ${toNumber} berhasil.`);
  } catch (err) {
    console.error(`❌ DB Error: Gagal simpan pesan keluar:`, err.message);
  }
}
// ======================================================
// ⚙️ SESSION MANAGEMENT (FIXED FOR REPLIT)
// ======================================================
export async function createSession(deviceId) {
  console.log(`🚀 Menginisialisasi session: ${deviceId}`);

  // 1. Database Setup (Status Awal)
  try {
    const existingDevice = await db.get(
      `SELECT deviceId FROM Devices WHERE deviceId = ?`,
      [deviceId],
    );
    if (!existingDevice) {
      await db.run(
        `INSERT INTO Devices (deviceId, status, createdAt) 
             VALUES (?, ?, ?)`,
        [deviceId, "initializing", Math.floor(Date.now() / 1000)],
      );
    } else {
      await updateDeviceStatus(deviceId, "initializing");
    }
  } catch (err) {
    console.error(`[DB ERROR] Setup device gagal:`, err.message);
  }

  // 2. Setup Client dengan Path Permanen
  // Gunakan 'wwebjs_auth' agar tidak dianggap file temporary oleh Replit
  const client = new Client({
    authStrategy: new pkg.LocalAuth({
      clientId: deviceId,
      dataPath: path.join(process.cwd(), "wwebjs_auth"),
    }),
    puppeteer: {
      headless: true,
      // 🛑 TAMBAHKAN INI: Membantu stabilitas di Replit
      handleSIGINT: false,
      handleSIGTERM: false,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', 
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        // "--single-process", // 👈 COBA MATIKAN BARIS INI (Kadang justru bikin crash di Replit baru)
        "--disable-gpu",
      ],
    },
  });

  // Event: QR Code
  client.on("qr", (qr) => {
    console.log(`[QR] Silakan scan QR untuk device: ${deviceId}`);
    qrcode.generate(qr, { small: true });
    updateDeviceStatus(deviceId, "QR");
    if (io) io.emit("qr-code", { deviceId, qr });
  });

  // Event: Authenticated
  client.on("authenticated", () => {
    console.log(`✅ ${deviceId} TERAUTENTIKASI (Session disimpan ke disk)`);
  });

  // Event: Auth Failure (PENTING: Biar tahu kalau session rusak)
  client.on("auth_failure", (msg) => {
    console.error(`❌ ${deviceId} GAGAL OTENTIKASI:`, msg);
    updateDeviceStatus(deviceId, "disconnected");
  });

  // Event: Ready
  client.on("ready", async () => {
    console.log(`✅ ${deviceId} DEVICE READY & CONNECTED`);
    // Simpan nomor WA ke DB agar status sinkron
    const waNumber = client.info.wid.user;
    await updateDeviceStatus(deviceId, "READY", waNumber);
  });

  // Event: Pesan masuk
  client.on("message", async (message) => {
    if (
      message.from.endsWith("@g.us") ||
      message.from.endsWith("@broadcast") ||
      message.isStatus ||
      message.from.endsWith("@newsletter") ||
      message.fromMe
    ) {
      return;
    }
    await saveInboxMessage(deviceId, message);
  });

  // Event: Disconnected
  client.on("disconnected", async (reason) => {
    console.log(`✖️ ${deviceId} Terputus: ${reason}`);
    await updateDeviceStatus(deviceId, "disconnected");
  });

  // Event: Error (PENTING agar error async dari Puppeteer/WhatsApp
  // tidak naik jadi unhandled error & mematikan seluruh backend).
  client.on("error", (err) => {
    console.error(`⚠️ Client error untuk ${deviceId}:`, err?.message || err);
  });

  // 3. Eksekusi Initialization
  try {
    // Bunuh proses Chromium yatim & hapus semua file lock untuk
    // mencegah error "profile appears to be in use" (Code 21)
    cleanupSessionLocks(deviceId);

    await client.initialize();
    clients.set(deviceId, client);
    return { success: true, deviceId };
  } catch (err) {
    console.error(`❌ Gagal initialize ${deviceId}:`, err.message);
    await updateDeviceStatus(deviceId, "disconnected");
    throw err;
  }
}

// ======================================================
// 🧾 GET QR CODE
// ======================================================
export async function getQRCode(deviceId) {
  for (let i = 0; i < 15; i++) {
    const qr = qrCodes.get(deviceId);
    if (qr) return qr;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("QR belum tersedia atau sudah expired (timeout).");
}

// ======================================================
// ✉️ KIRIM PESAN (TEXT / IMAGE) + VALIDASI NOMOR WA (FIX: BIN IMAGE BUG)
// ======================================================
export async function sendMessageService(
  deviceId,
  number,
  message,
  imagePath = null,
  scheduleId = null, // ✅ TAMBAH INI
) {
  const tempMessageId = Date.now().toString();
  const formatted = number.includes("@c.us") ? number : `${number}@c.us`;
  const plainNumber = number.replace("@c.us", "");

  await saveOutboxMessage(
    deviceId,
    formatted,
    message,
    "PENDING",
    tempMessageId,
    scheduleId,
  ); // ✅ TAMBAH scheduleId

  try {
    const client = clients.get(deviceId);
    if (!client) throw new Error("Device belum aktif atau tidak terhubung.");

    const isRegistered = await client.getNumberId(plainNumber);
    if (!isRegistered) {
      console.warn(`🚫 Nomor ${plainNumber} tidak terdaftar di WhatsApp.`);
      await db.run(`UPDATE Messages SET status = ? WHERE messageId = ?`, [
        "NOT_REGISTERED",
        tempMessageId,
      ]);
      return { success: false, message: "Nomor tidak terdaftar di WhatsApp" };
    }

    let absolutePath = imagePath ? path.resolve(imagePath) : null;
    let response;

    if (absolutePath && fs.existsSync(absolutePath)) {
      const ext = path.extname(absolutePath).toLowerCase();
      let mimeType = "application/octet-stream";
      if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
      else if (ext === ".png") mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else mimeType = "image/jpeg";

      const media = pkg.MessageMedia.fromFilePath(absolutePath);
      media.mimetype = mimeType;
      media.filename = `image_${Date.now()}${ext || ".jpg"}`;

      console.log(`🖼️ Mengirim gambar: ${absolutePath} as ${mimeType}`);
      response = await client.sendMessage(formatted, media, {
        caption: message,
      });
    } else {
      console.log(`💬 Mengirim pesan teks murni ke: ${formatted}`);
      response = await client.sendMessage(formatted, message);
    }

    await db.run(
      `UPDATE Messages SET status = ?, messageId = ? WHERE messageId = ?`,
      ["SENT", response.id._serialized, tempMessageId],
    );

    return { success: true, message: "Pesan terkirim" };
  } catch (err) {
    await db.run(`UPDATE Messages SET status = ? WHERE messageId = ?`, [
      "FAILED",
      tempMessageId,
    ]);
    console.error(`❌ Gagal kirim ke ${number}:`, err.message);
    throw err;
  }
}
// ======================================================
// 🔁 AUTO RECONNECT (FINAL)
// ======================================================
export async function autoReconnectDevices() {
  console.log("♻️ Auto reconnect start...");

  try {
    const devices = await listDevices();

    for (const d of devices) {
      try {
        // ❌ JANGAN SET INITIATING LAGI
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
    console.log(`⚠️ Memulai proses penghapusan total device: ${deviceId}`);

    // 1. Ambil client dari memory
    const client = clients.get(deviceId);

    // 2. WAJIB: Hapus dulu dari database SEBELUM hapus folder
    // Biar kalau NPM restart, autoReconnect nggak nemu data ini lagi
    await db.run(`DELETE FROM Devices WHERE deviceId = ?`, [deviceId]);
    await db.run(`DELETE FROM whatsapp_sessions WHERE device_id = ?`, [
      deviceId,
    ]);
    console.log(`✅ Data ${deviceId} dihapus dari Database.`);

    if (client) {
      console.log(`🔌 Mematikan koneksi WhatsApp untuk ${deviceId}...`);
      // Gunakan logout() agar session di server WA juga diputus
      try {
        await client.logout();
        await client.destroy();
      } catch (logErr) {
        console.log("Catatan: Client sudah mati sebelum logout.");
      }
      clients.delete(deviceId);
    }

    // 3. Bunuh proses Chromium yatim untuk device ini, lalu hapus folder fisik
    cleanupSessionLocks(deviceId);
    setTimeout(() => {
      const sessionPath = path.join(
        process.cwd(),
        "wwebjs_auth",
        `session-${deviceId}`,
      );
      if (fs.existsSync(sessionPath)) {
        try {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          console.log(`📁 Folder fisik ${deviceId} dibersihkan.`);
        } catch (e) {
          console.error(`⚠️ Gagal hapus folder ${deviceId}:`, e.message);
        }
      }
    }, 2000);

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

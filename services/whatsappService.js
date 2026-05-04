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
        } catch (e) {}
      }
    }
  } catch (e) {}

  try {
    if (fs.existsSync(sessionDir)) {
      for (const name of fs.readdirSync(sessionDir)) {
        if (name.startsWith("Singleton")) {
          try { fs.unlinkSync(path.join(sessionDir, name)); } catch (_) {}
        }
      }
      const defaultDir = path.join(sessionDir, "Default");
      if (fs.existsSync(defaultDir)) {
        for (const name of fs.readdirSync(defaultDir)) {
          if (name.startsWith("Singleton")) {
            try { fs.unlinkSync(path.join(defaultDir, name)); } catch (_) {}
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
const qrCodes = new Map();
const clients = new Map();
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
// 🔧 DATABASE SESSION
// ======================================================
async function getSessionFromDB(deviceId) {
  const row = await db.get(
    `SELECT session_data FROM whatsapp_sessions WHERE device_id = ?`,
    [deviceId],
  );
  return row ? JSON.parse(row.session_data) : null;
}

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
// 💾 SIMPAN PESAN
// ======================================================
async function saveInboxMessage(deviceId, message) {
  try {
    const contact = await message.getContact();

    let finalNumber = "";
    if (contact.number) {
      finalNumber = contact.number;
    } else if (message.author) {
      finalNumber = message.author.split("@")[0].split(":")[0];
    } else {
      finalNumber = message.from.split("@")[0].split(":")[0];
    }

    finalNumber = finalNumber.replace(/\D/g, "");

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
// ⚙️ SESSION MANAGEMENT — FIXED
// ======================================================
export async function createSession(deviceId) {
  console.log(`🚀 Menginisialisasi session: ${deviceId}`);

  // Cegah duplikat session
  if (clients.has(deviceId)) {
    console.log(`⚠️ Session ${deviceId} sudah ada, skip.`);
    return { success: true, deviceId };
  }

  try {
    const existingDevice = await db.get(
      `SELECT deviceId FROM Devices WHERE deviceId = ?`,
      [deviceId],
    );
    if (!existingDevice) {
      await db.run(
        `INSERT INTO Devices (deviceId, status, createdAt) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE status = 'initializing'`,
        [deviceId, "initializing", Math.floor(Date.now() / 1000)],
      );
    } else {
      await updateDeviceStatus(deviceId, "initializing");
    }
  } catch (err) {
    console.error(`[DB ERROR] Setup device gagal:`, err.message);
  }

  const client = new Client({
    authStrategy: new pkg.LocalAuth({
      clientId: deviceId,
      dataPath: path.join(process.cwd(), "wwebjs_auth"),
    }),
    puppeteer: {
      headless: true,
      handleSIGINT: false,
      handleSIGTERM: false,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",

      // ✅ FIX UTAMA: Naikkan timeout jadi 120 detik
      timeout: 120000,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        // ❌ HAPUS --single-process — ini penyebab ready tidak terpicu!
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--no-default-browser-check",
        "--memory-pressure-off",
        // ✅ Tambahan untuk stabilitas di server
        "--disable-web-security",
        "--allow-running-insecure-content",
        "--disable-features=IsolateOrigins,site-per-process",
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

  // ✅ FIX: Tambah event loading_screen agar status update saat loading
  client.on("loading_screen", (percent, message) => {
    console.log(`⏳ ${deviceId} loading: ${percent}% — ${message}`);
    if (io) io.emit("device-loading", { deviceId, percent, message });
  });

  // Event: Authenticated
  client.on("authenticated", () => {
    console.log(`✅ ${deviceId} TERAUTENTIKASI — menunggu ready...`);
    // ✅ Update status ke 'authenticated' supaya frontend tahu prosesnya jalan
    updateDeviceStatus(deviceId, "authenticated");
  });

  // Event: Auth Failure
  client.on("auth_failure", (msg) => {
    console.error(`❌ ${deviceId} GAGAL OTENTIKASI:`, msg);
    updateDeviceStatus(deviceId, "disconnected");
    clients.delete(deviceId);
  });
  // Tambahkan ini — tangkap semua event raw
client.pupPage?.on('console', msg => {
  console.log(`[BROWSER ${deviceId}]:`, msg.text());
});

client.pupPage?.on('error', err => {
  console.error(`[BROWSER ERROR ${deviceId}]:`, err.message);
});

  // Event: Ready
  client.on("ready", async () => {
    console.log(`✅ ${deviceId} DEVICE READY & CONNECTED`);
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
    clients.delete(deviceId);

    // ✅ Auto reconnect setelah 10 detik jika terputus
    console.log(`🔄 Mencoba reconnect ${deviceId} dalam 10 detik...`);
    setTimeout(() => {
      createSession(deviceId).catch((e) =>
        console.error(`❌ Reconnect ${deviceId} gagal:`, e.message)
      );
    }, 10000);
  });

  // Event: Error
  client.on("error", (err) => {
    console.error(`⚠️ Client error untuk ${deviceId}:`, err?.message || err);
  });

  try {
    cleanupSessionLocks(deviceId);
    await client.initialize();
    clients.set(deviceId, client);
    return { success: true, deviceId };
  } catch (err) {
    console.error(`❌ Gagal initialize ${deviceId}:`, err.message);
    await updateDeviceStatus(deviceId, "disconnected");
    clients.delete(deviceId);
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
// ✉️ KIRIM PESAN
// ======================================================
export async function sendMessageService(
  deviceId,
  number,
  message,
  imagePath = null,
  scheduleId = null,
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
  );

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
// 🔁 AUTO RECONNECT
// ======================================================
export async function autoReconnectDevices() {
  console.log("♻️ Auto reconnect start...");

  try {
    const devices = await listDevices();

    for (const d of devices) {
      // ✅ Skip device yang sudah ada di memory
      if (clients.has(d.deviceId)) {
        console.log(`⏭️ Skip ${d.deviceId} — sudah aktif.`);
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
    console.log(`⚠️ Memulai proses penghapusan total device: ${deviceId}`);

    const client = clients.get(deviceId);

    await db.run(`DELETE FROM Devices WHERE deviceId = ?`, [deviceId]);
    await db.run(`DELETE FROM whatsapp_sessions WHERE device_id = ?`, [
      deviceId,
    ]);
    console.log(`✅ Data ${deviceId} dihapus dari Database.`);

    if (client) {
      console.log(`🔌 Mematikan koneksi WhatsApp untuk ${deviceId}...`);
      try {
        await client.logout();
        await client.destroy();
      } catch (logErr) {
        console.log("Catatan: Client sudah mati sebelum logout.");
      }
      clients.delete(deviceId);
    }

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

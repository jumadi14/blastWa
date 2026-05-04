// controllers/deviceController.js
import db from "../models/db.js";
import {
  createSession,
  getQRCode,
  sendMessageService,
  deleteSession,
} from "../services/whatsappService.js";

// ======================================================
// ➕ CREATE DEVICE
// ======================================================
export async function createDevice(req, res) {
  try {
    const { deviceId, userId } = req.body;

    if (!deviceId || !userId) {
      return res.status(400).json({
        success: false,
        message: "deviceId dan userId wajib diisi.",
      });
    }

    // Cek apakah deviceId sudah ada
    const existing = await db.get(
      `SELECT deviceId FROM Devices WHERE deviceId = ?`,
      [deviceId]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Device "${deviceId}" sudah terdaftar.`,
      });
    }

    // ✅ FIXED: Gunakan INSERT biasa + ON DUPLICATE KEY (MySQL syntax)
    await db.run(
      `INSERT INTO Devices (deviceId, status, userId, createdAt)
       VALUES (?, 'initializing', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'initializing'`,
      [deviceId, userId, Math.floor(Date.now() / 1000)]
    );

    // Daftarkan ke tabel UserDevices juga
    await db.run(
      `INSERT INTO UserDevices (user_id, device_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId, deviceId]
    ).catch(() => {
      // Abaikan jika tabel UserDevices tidak ada / kolom beda
    });

    // Mulai session Baileys (non-blocking)
    createSession(deviceId).catch((err) => {
      console.error(`❌ createSession error (${deviceId}):`, err.message);
    });

    return res.json({
      success: true,
      message: `Device "${deviceId}" berhasil dibuat. Scan QR untuk menghubungkan.`,
    });
  } catch (err) {
    console.error("❌ Gagal buat device:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ======================================================
// 📷 GET QR CODE
// ======================================================
export async function getQRCodeController(req, res) {
  try {
    const { id } = req.params;
    const qr = await getQRCode(id);
    return res.json({ success: true, qr });
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message });
  }
}

// ======================================================
// ✉️ SEND MESSAGE
// ======================================================
export async function sendMessageController(req, res) {
  try {
    const { deviceId, number, message, scheduleId } = req.body;

    if (!deviceId || !number || !message) {
      return res.status(400).json({
        success: false,
        message: "deviceId, number, dan message wajib diisi.",
      });
    }

    // Cek apakah ada file attachment
    const imagePath = req.file?.path || null;

    const result = await sendMessageService(
      deviceId,
      number,
      message,
      imagePath,
      scheduleId || null
    );

    return res.json(result);
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ======================================================
// 🗑️ DELETE DEVICE
// ======================================================
export async function deleteDevice(req, res) {
  try {
    const { id } = req.params;

    const existing = await db.get(
      `SELECT deviceId FROM Devices WHERE deviceId = ?`,
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Device "${id}" tidak ditemukan.`,
      });
    }

    await deleteSession(id);

    return res.json({
      success: true,
      message: `Device "${id}" berhasil dihapus.`,
    });
  } catch (err) {
    console.error("❌ Gagal hapus device:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

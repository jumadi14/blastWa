// 📁 src/controllers/deviceController.js
import {
  createSession,
  getQRCode,
  sendMessageService,
  deleteSession
} from "../services/whatsappService.js";

import db from "../models/db.js";

/** 🧩 Buat device baru dan generate session */
export const createDevice = async (req, res) => {
  try {
    const { deviceId, userId } = req.body;
    if (!deviceId || !userId) {
      return res
        .status(400)
        .json({ success: false, message: "deviceId dan userId wajib diisi" });
    }

    // Buat session di WhatsApp service
    const result = await createSession(deviceId);

    // Simpan info device ke tabel Devices
    const now = Math.floor(Date.now() / 1000);
    await db.run(
      "INSERT OR REPLACE INTO Devices (deviceId, status, createdAt, userId) VALUES (?, ?, ?, ?)",
      [deviceId, "INITIATING", now, userId]
    );

    // Simpan relasi ke tabel UserDevices
    await db.run(
      "INSERT INTO UserDevices (user_id, device_id) VALUES (?, ?)",
      [userId, deviceId]
    );

    res.json({
      success: true,
      message: `Device ${deviceId} berhasil dibuat dan terhubung ke user ${userId}`,
      data: result
    });
  } catch (err) {
    console.error("❌ Gagal buat device:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** 🧩 Ambil QR Code dari session */
export const getQRCodeController = async (req, res) => {
  try {
    const { id } = req.params;
    const qr = await getQRCode(id);
    res.json({ success: true, deviceId: id, qr });
  } catch (err) {
    console.error(`❌ Gagal ambil QR untuk ${req.params.id}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** 🧩 List semua device dari DB (filter sesuai role user) */
export const getAllDevices = async (req, res) => {
  try {
    const { userId, role } = req.query;

    let devices;
    if (role === "superuser") {
      // Superuser lihat semua + nama pemilik
      devices = await db.all(`
        SELECT D.*, U.username
        FROM Devices D
        LEFT JOIN UserDevices UD ON D.deviceId = UD.device_id
        LEFT JOIN Users U ON U.id = UD.user_id
        ORDER BY D.createdAt DESC
      `);
    } else {
      // User biasa lihat hanya miliknya
      devices = await db.all(
        `
        SELECT D.*
        FROM Devices D
        INNER JOIN UserDevices UD ON D.deviceId = UD.device_id
        WHERE UD.user_id = ?
        ORDER BY D.createdAt DESC
        `,
        [userId]
      );
    }

    res.json({ success: true, data: devices });
  } catch (err) {
    console.error("❌ Gagal list device:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** 🧩 Kirim pesan dari device tertentu */
export const sendMessageController = async (req, res) => {
  try {
    const { deviceId, number, message } = req.body;
    const result = await sendMessageService(deviceId, number, message);
    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** 🧩 Hapus atau Logout device */
export const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;

    await deleteSession(id);

    // Hapus dari semua tabel terkait
    await db.run("DELETE FROM Devices WHERE deviceId = ?", [id]);
  

    res.json({
      success: true,
      message: `Session ${id} berhasil dihapus dan unlinked dari user.`
    });
  } catch (err) {
    console.error("❌ Gagal hapus device:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};


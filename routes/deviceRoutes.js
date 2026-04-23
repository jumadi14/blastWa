// 📁 routes/deviceRoutes.js (ESM)

import express from "express";
import db from "../models/db.js"; // 🔥 kita butuh ini buat query langsung ke sqlite
import {
  createDevice,
  getQRCodeController,
  sendMessageController,
  deleteDevice
} from "../controllers/deviceController.js";

const router = express.Router();

/**
 * GET /api/device
 * 🔹 Ambil semua device milik user login
 * 🔹 Jika role = superuser → tampilkan semua device
 * 🔹 Jika role = user → tampilkan hanya device yang terdaftar di tabel UserDevices
 */
router.get("/", async (req, res) => {
  try {
    const { userId, role } = req.query;

    if (!userId || !role) {
      return res.status(400).json({
        success: false,
        message: "userId dan role wajib dikirim (query params)"
      });
    }

    let devices = [];

    if (role === "superuser") {
      // Admin bisa lihat semua device
      devices = await db.all(`SELECT * FROM Devices`);
    } else {
      // User biasa hanya bisa lihat device miliknya
      const userDevices = await db.all(
        `SELECT device_id FROM UserDevices WHERE user_id = ?`,
        [userId]
      );

      const deviceIds = userDevices.map((d) => d.device_id);

      if (deviceIds.length === 0) {
        return res.json({ success: true, devices: [] });
      }

      const placeholders = deviceIds.map(() => "?").join(",");
      devices = await db.all(
        `SELECT * FROM Devices WHERE deviceId IN (${placeholders})`,
        deviceIds
      );
    }

    res.json({ success: true, devices });
  } catch (error) {
    console.error("❌ Error GET /device:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/** POST /api/device/create */
router.post("/create", createDevice);

/** GET /api/device/qrcode/:id */
router.get("/qrcode/:id", getQRCodeController);

/** POST /api/device/send */
router.post("/send", sendMessageController);

/** DELETE /api/device/delete/:id */
router.delete("/delete/:id", deleteDevice);

export default router;


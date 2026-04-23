// 📁 routes/sentRoutes.js (ESM)
import express from "express";
import db from "../models/db.js"; // akses SQLite
import { getSentMessagesController } from "../controllers/sentMessageController.js";

const router = express.Router();

/**
 * GET /api/sent
 * 🔹 Ambil semua pesan terkirim
 * 🔹 Jika role = superuser → tampilkan semua pesan
 * 🔹 Jika role = user → tampilkan hanya pesan dari device milik user
 * 🔹 Harus kirim query params: userId, role
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

        let sentMessages = [];

        if (role === "superuser") {
            // superuser bisa lihat semua pesan
            sentMessages = await db.all(`SELECT * FROM Messages ORDER BY timestamp DESC`);
        } else {
            // user biasa hanya pesan dari device miliknya
            const userDevices = await db.all(
                `SELECT device_id FROM UserDevices WHERE user_id = ?`,
                [userId]
            );

            const deviceIds = userDevices.map(d => d.device_id);

            if (deviceIds.length === 0) {
                return res.json({ success: true, data: [] });
            }

            const placeholders = deviceIds.map(() => "?").join(",");
            sentMessages = await db.all(
                `SELECT * FROM Messages WHERE deviceId IN (${placeholders}) ORDER BY timestamp DESC`,
                deviceIds
            );
        }

        res.json({ success: true, data: sentMessages });
    } catch (error) {
        console.error("❌ Error GET /sent:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;


// 📁 controllers/inboxController.js
import db from "../models/db.js";
import { getGroupedInboxMessages } from "../services/inboxService.js";

/** 🔹 Ambil list thread pesan (terbaru per nomor) (GET /api/inbox) */
export const getInbox = async (req, res) => {
    try {
        // Tambahkan 'role' dari query params
        const { userId, role, deviceId, status } = req.query; 

        if (!userId || !role) { // Wajibkan userId dan role
            return res.status(400).json({ success: false, message: "UserId dan Role wajib diberikan." });
        }

        let allowedDeviceIds = [];

        // --- LOGIKA OTORISASI SUPERUSER / USER BIASA ---
        if (role === 'superuser') {
            // 1. SUPERUSER: Ambil SEMUA device ID dari tabel Devices
            const allDevices = await db.all(`SELECT deviceId FROM Devices`);
            allowedDeviceIds = allDevices.map(d => d.deviceId);
            console.log(`[INBOX] Superuser (${userId}) mengakses semua ${allowedDeviceIds.length} device.`);
        } else {
            // 2. USER BIASA: Ambil device ID yang dimiliki user dari tabel UserDevices
            const userDevices = await db.all(
                `SELECT device_id FROM UserDevices WHERE user_id = ?`,
                [userId]
            );
            allowedDeviceIds = userDevices.map(d => d.device_id);
            console.log(`[INBOX] User biasa (${userId}) mengakses ${allowedDeviceIds.length} device.`);
        }
        
        if (allowedDeviceIds.length === 0) {
            return res.json({ success: true, data: [] }); // User tidak punya device
        }

        // --- LOGIKA FILTER DEVICE ID DARI QUERY PARAM ---
        let filteredDeviceId = null;
        if (deviceId && allowedDeviceIds.includes(deviceId)) {
            // Filter hanya berlaku jika deviceId diminta DAN deviceId tersebut termasuk yang diizinkan
            filteredDeviceId = deviceId;
        } else if (deviceId && !allowedDeviceIds.includes(deviceId)) {
            // Jika deviceId diminta tapi user tidak punya izin, tolak.
            return res.status(403).json({ success: false, message: "Akses device ID tersebut ditolak." });
        }


        // Panggil service: allowedDeviceIds dikirim ke service untuk filtering di query SQL.
        const messages = await getGroupedInboxMessages(filteredDeviceId, allowedDeviceIds, status);

        res.json({ success: true, data: messages });
    } catch (err) {
        console.error("❌ Gagal ambil pesan Inbox di controller:", err.message);
        res.status(500).json({ success: false, message: "Gagal mengambil pesan masuk." });
    }
};

// controllers/dashboardController.js
import db from "../models/db.js";

// ==========================
// Status Pesan (Konstanta)
// ==========================
const SENT_STATUSES = ["SENT", "DELIVERED", "READ", "PLAYED"];
const FAILED_STATUSES = ["FAILED", "REVOKED", "NOT_REGISTERED"];
const PENDING_STATUSES = ["PENDING", "QUEUED", "SENDING"];

// ==========================
// Helper: Filter berdasarkan timeframe
// ==========================
const getTimeFilter = (timeframe) => {
    const now = Math.floor(Date.now() / 1000);
    const oneDay = 60 * 60 * 24;
    let startTime;

    switch (timeframe) {
        case "today":
            startTime = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
            break;
        case "last_7_days":
            startTime = now - oneDay * 7;
            break;
        case "this_month":
            startTime = Math.floor(
                new Date(
                    new Date().getFullYear(),
                    new Date().getMonth(),
                    1,
                ).getTime() / 1000,
            );
            break;
        case "total":
        default:
            return "";
    }
    return `timestamp >= ${startTime}`;
};

// ==========================
// Helper: Data User (Ambil Role & Device IDs dari DB menggunakan userId sebagai Kunci)
// ==========================
const getUserDataFromDb = async (userId) => {
    // 1. Ambil Role user dari tabel Users
    const userRow = await db.get("SELECT role FROM Users WHERE id = ?", [
        userId,
    ]);

    if (!userRow) {
        throw new Error("User ID tidak terdaftar di database.");
    }

    // 2. Ambil Device IDs yang terhubung
    const devicesRows = await db.all(
        "SELECT device_id FROM UserDevices WHERE user_id = ?",
        [userId],
    );
    const deviceIds = devicesRows.map((row) => row.device_id);

    return {
        role: userRow.role,
        deviceIds: deviceIds,
    };
};

// =======================================================
//                   ENDPOINT UMUM (USER BIASA)
// =======================================================

// ==========================
// Message Summary
// ==========================
export const getMessageSummary = async (req, res) => {
    try {
        const { userId, timeframe } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);
        const timeFilter = getTimeFilter(timeframe);

        let deviceFilter = "";
        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            deviceFilter = `AND deviceId IN (${devices})`;
        }

        const whereClause = timeFilter
            ? `WHERE ${timeFilter} ${deviceFilter}`
            : deviceFilter
              ? `WHERE 1=1 ${deviceFilter}`
              : "";

        const sql = `
            SELECT
                SUM(CASE WHEN status IN (${SENT_STATUSES.map((s) => `'${s}'`).join(",")}) THEN 1 ELSE 0 END) AS totalSent,
                SUM(CASE WHEN status IN (${FAILED_STATUSES.map((s) => `'${s}'`).join(",")}) THEN 1 ELSE 0 END) AS totalFailed,
                SUM(CASE WHEN status IN (${PENDING_STATUSES.map((s) => `'${s}'`).join(",")}) THEN 1 ELSE 0 END) AS totalPending
            FROM Messages
            ${whereClause};
        `;

        const result = await db.get(sql);

        return res.json({
            totalSent: Number(result?.totalSent) || 0,
            totalFailed: Number(result?.totalFailed) || 0,
            totalPending: Number(result?.totalPending) || 0,
        });
    } catch (err) {
        console.error("Error fetching message summary:", err.message);
        return res
            .status(500)
            .json({ error: err.message || "Gagal mengambil ringkasan pesan." });
    }
};

// ==========================
// Device Summary
// ==========================
export const getDeviceSummary = async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);

        let sql = "SELECT deviceId, status FROM Devices";

        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            sql += ` WHERE deviceId IN (${devices})`;
        }

        const devices = await db.all(sql);

        const totalDevices = devices.length;
        const totalOnline = devices.filter(
            (d) => d.status.toLowerCase() === "ready",
        ).length;
        const totalOffline = totalDevices - totalOnline;

        return res.json({
            total: totalDevices,
            online: totalOnline,
            offline: totalOffline,
        });
    } catch (err) {
        console.error("Error fetching devices:", err.message);
        return res.status(500).json({
            error: err.message || "Gagal mengambil ringkasan perangkat.",
        });
    }
};

// ==========================
// Inbox Summary
// ==========================
export const getInboxSummary = async (req, res) => {
    try {
        const { userId, timeframe } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);
        const timeFilter = getTimeFilter(timeframe);

        let deviceFilter = "";
        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            deviceFilter = `AND deviceId IN (${devices})`;
        }

        const whereClause = timeFilter
            ? `WHERE ${timeFilter} ${deviceFilter}`
            : deviceFilter
              ? `WHERE 1=1 ${deviceFilter}`
              : "";

        const sql = `
            SELECT 
                COUNT(*) AS totalInbox,
                SUM(CASE WHEN isRead = 1 THEN 1 ELSE 0 END) AS totalRead,
                SUM(CASE WHEN isRead = 0 THEN 1 ELSE 0 END) AS totalUnread
            FROM Inbox
            ${whereClause};
        `;
        const result = await db.get(sql);

        return res.json({
            totalInbox: Number(result?.totalInbox) || 0,
            totalRead: Number(result?.totalRead) || 0,
            totalUnread: Number(result?.totalUnread) || 0,
        });
    } catch (err) {
        console.error("Error fetching inbox summary:", err.message);
        return res
            .status(500)
            .json({ error: err.message || "Gagal mengambil ringkasan inbox." });
    }
};

// ==========================
// Recent Outgoing Messages
// ==========================
export const getRecentOutgoing = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const { userId } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);

        let deviceFilter = "";
        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            deviceFilter = `WHERE m.deviceId IN (${devices})`;
        }

        const sql = `
            SELECT m.id, m.deviceId, m.toNumber, m.body, m.timestamp, m.status, d.phoneNumber AS deviceName
            FROM Messages m
            LEFT JOIN Devices d ON m.deviceId = d.deviceId
            ${deviceFilter}
            ORDER BY m.timestamp DESC
           LIMIT ${limit}; 
        `;

        // PENTING: Hapus array [limit] di bawah ini, biarkan kosong ()
        const rows = await db.all(sql);

        const data = rows.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp * 1000,
            status: msg.status ? msg.status.toLowerCase() : "pending",
            deviceName: msg.deviceName || msg.deviceId || "Unknown Device",
        }));

        return res.json(data);
    } catch (err) {
        console.error("Error fetching recent outgoing:", err.message);
        return res.status(500).json({
            error: err.message || "Gagal memuat pesan keluar terbaru.",
        });
    }
};

// ==========================
// Recent Incoming Messages
// ==========================
export const getRecentIncoming = async (req, res) => {
    try {
        // Pastikan limit adalah angka murni
        const limit = parseInt(req.query.limit) || 10;
        const { userId } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);

        let deviceFilter = "";
        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            deviceFilter = `WHERE i.deviceId IN (${devices})`;
        }

        // PERBAIKAN DI SINI: Masukkan ${limit} langsung ke dalam string
        const sql = `
            SELECT i.id, i.deviceId, i.fromNumber, i.body, i.timestamp, d.phoneNumber AS deviceName
            FROM Inbox i
            LEFT JOIN Devices d ON i.deviceId = d.deviceId
            ${deviceFilter}
            ORDER BY i.timestamp DESC
            LIMIT ${limit}; 
        `;

        // PENTING: Hapus array [limit] di bawah ini, biarkan kosong ()
        const rows = await db.all(sql);

        const data = rows.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp * 1000,
            status: "received",
            deviceName: msg.deviceName || msg.deviceId || "Unknown Device",
        }));

        return res.json(data);
    } catch (err) {
        console.error("Error fetching recent incoming:", err.message);
        return res.status(500).json({
            error: err.message || "Gagal memuat pesan masuk terbaru.",
        });
    }
};

// =======================================================
//                   ENDPOINT KHUSUS SUPERUSER (ADMIN)
// =======================================================

// ==========================
// Admin Message Summary
// ==========================
export const getAdminMessageSummary = async (req, res) => {
    try {
        // 🚨 Tindakan Isolasi Kritis: Pastikan userId tidak ada
        req.query.userId = null;

        const { timeframe } = req.query;
        const timeFilter = getTimeFilter(timeframe);

        const whereClause = timeFilter ? `WHERE ${timeFilter}` : "";

        const sql = `
            SELECT
                SUM(CASE WHEN status IN (${SENT_STATUSES.map((s) => `'${s}'`).join(",")}) THEN 1 ELSE 0 END) AS totalSent,
                SUM(CASE WHEN status IN (${FAILED_STATUSES.map((s) => `'${s}'`).join(",")}) THEN 1 ELSE 0 END) AS totalFailed,
                SUM(CASE WHEN status IN (${PENDING_STATUSES.map((s) => `'${s}'`).join(",")}) THEN 1 ELSE 0 END) AS totalPending
            FROM Messages
            ${whereClause};
        `;

        const result = await db.get(sql);

        return res.json({
            totalSent: Number(result?.totalSent) || 0,
            totalFailed: Number(result?.totalFailed) || 0,
            totalPending: Number(result?.totalPending) || 0,
        });
    } catch (err) {
        console.error("Error fetching admin message summary:", err.message);
        return res
            .status(500)
            .json({ error: "Gagal mengambil ringkasan pesan Admin." });
    }
};

// ==========================
// Admin Device Summary
// ==========================
export const getAdminDeviceSummary = async (req, res) => {
    try {
        // 🚨 Tindakan Isolasi Kritis: Pastikan userId tidak ada
        req.query.userId = null;

        let sql = "SELECT deviceId, status FROM Devices";

        const devices = await db.all(sql);

        const totalDevices = devices.length;
        const totalOnline = devices.filter(
            (d) => d.status.toLowerCase() === "ready",
        ).length;
        const totalOffline = totalDevices - totalOnline;

        return res.json({
            total: totalDevices,
            online: totalOnline,
            offline: totalOffline,
        });
    } catch (err) {
        console.error("Error fetching admin devices:", err.message);
        return res
            .status(500)
            .json({ error: "Gagal mengambil ringkasan perangkat Admin." });
    }
};

// ==========================
// Admin Inbox Summary
// ==========================
export const getAdminInboxSummary = async (req, res) => {
    try {
        // 🚨 Tindakan Isolasi Kritis: Pastikan userId tidak ada
        req.query.userId = null;

        const { timeframe } = req.query;
        const timeFilter = getTimeFilter(timeframe);

        const whereClause = timeFilter ? `WHERE ${timeFilter}` : "";

        const sql = `
            SELECT 
                COUNT(*) AS totalInbox,
                SUM(CASE WHEN isRead = 1 THEN 1 ELSE 0 END) AS totalRead,
                SUM(CASE WHEN isRead = 0 THEN 1 ELSE 0 END) AS totalUnread
            FROM Inbox
            ${whereClause};
        `;
        const result = await db.get(sql);

        return res.json({
            totalInbox: Number(result?.totalInbox) || 0,
            totalRead: Number(result?.totalRead) || 0,
            totalUnread: Number(result?.totalUnread) || 0,
        });
    } catch (err) {
        console.error("Error fetching admin inbox summary:", err.message);
        return res
            .status(500)
            .json({ error: "Gagal mengambil ringkasan inbox Admin." });
    }
};

// ==========================
// Admin Recent Outgoing Messages (Final Fix: TANPA Filter + Isolasi)
// ==========================
export const getAdminRecentOutgoing = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // 🚨 TINDAKAN ISOLASI KRITIS: Pastikan userId di request diabaikan
        req.query.userId = null;

        const sql = `
            SELECT m.id, m.deviceId, m.toNumber, m.body, m.timestamp, m.status, d.phoneNumber AS deviceName
            FROM Messages m
            LEFT JOIN Devices d ON m.deviceId = d.deviceId
            ORDER BY m.timestamp DESC
            LIMIT ?;
        `;
        const rows = await db.all(sql, [limit]);

        const data = rows.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp * 1000,
            status: msg.status ? msg.status.toLowerCase() : "pending",
            deviceName: msg.deviceName || msg.deviceId || "Unknown Device",
        }));

        return res.json(data);
    } catch (err) {
        console.error("Error fetching admin recent outgoing:", err.message);
        return res
            .status(500)
            .json({ error: "Gagal memuat pesan keluar terbaru Admin." });
    }
};

// ==========================
// Admin Recent Incoming Messages (Final Fix: TANPA Filter + Isolasi)
// ==========================
export const getAdminRecentIncoming = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // 🚨 TINDAKAN ISOLASI KRITIS: Pastikan userId di request diabaikan
        req.query.userId = null;

        const sql = `
            SELECT i.id, i.deviceId, i.fromNumber, i.body, i.timestamp, d.phoneNumber AS deviceName
            FROM Inbox i
            LEFT JOIN Devices d ON i.deviceId = d.deviceId
            ORDER BY i.timestamp DESC
            LIMIT ?;
        `;
        const rows = await db.all(sql, [limit]);

        const data = rows.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp * 1000,
            status: "received",
            deviceName: msg.deviceName || msg.deviceId || "Unknown Device",
        }));

        return res.json(data);
    } catch (err) {
        console.error("Error fetching admin recent incoming:", err.message);
        return res
            .status(500)
            .json({ error: "Gagal memuat pesan masuk terbaru Admin." });
    }
};
// ==========================
// Admin Schedule Details
// ==========================
export const getAdminScheduleDetails = async (req, res) => {
    try {
        // 🚨 Tindakan Isolasi Kritis: Pastikan userId di request diabaikan
        req.query.userId = null;

        const { timeframe } = req.query;
        const timeFilter = getTimeFilter(timeframe);

        // Hanya filter waktu yang digunakan, tanpa filter perangkat
        const finalTimeFilter = timeFilter.replace("timestamp", "createdAt");
        const whereClause = finalTimeFilter ? `WHERE ${finalTimeFilter}` : "";

        const sql = `
            SELECT 
                id, 
                message, 
                createdAt,
                scheduleAt,
                status, 
                deviceId, 
                contacts 
            FROM Schedules
            ${whereClause}
            ORDER BY createdAt DESC;
        `;

        const rows = await db.all(sql);

        const data = rows.map((schedule) => ({
            id: schedule.id,

            // 1. Ganti judul menjadi 'name' dari tabel Templates
            // Jika 'name' kosong, tetap pakai potongan pesan sebagai cadangan
            title: schedule.name || schedule.message.substring(0, 50) + "...",

            start: Number(schedule.scheduleAt) * 1000,
            allDay: false,
            status: schedule.status,
            deviceId: schedule.deviceId,
            contactsCount: JSON.parse(schedule.contacts).length || 0,

            // 2. Pastikan delay juga ikut terambil
            delay: schedule.delay || 0,
        }));

        return res.json(data);
    } catch (err) {
        console.error("Error fetching schedule details (Admin):", err.message);
        return res
            .status(500)
            .json({ error: "Gagal memuat detail jadwal Admin." });
    }
};

// =======================================================
//                   ENDPOINT UMUM (USER BIASA)
// =======================================================

// ... (getMessageSummary, getDeviceSummary, getInboxSummary di sini) ...

// ==========================
// Schedule Details (User Biasa)
// ==========================
export const getScheduleDetails = async (req, res) => {
    try {
        const { userId, timeframe } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);
        const timeFilter = getTimeFilter(timeframe);

        let deviceFilter = "";
        // Cek jika bukan superuser DAN punya device
        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            deviceFilter = `AND deviceId IN (${devices})`;
        }

        // Pastikan filter waktu diarahkan ke kolom 'createdAt' dan terpisah dari deviceFilter
        const finalTimeFilter = timeFilter.replace("timestamp", "createdAt");

        const whereClauses = [];
        if (finalTimeFilter) whereClauses.push(finalTimeFilter);
        if (deviceFilter) whereClauses.push(deviceFilter.substring(4)); // Hapus 'AND ' di awal

        const whereClause =
            whereClauses.length > 0
                ? `WHERE ${whereClauses.join(" AND ")}`
                : "";

        // Catatan: Saya menggunakan logika WHERE yang lebih robust (AND) untuk menghindari spasi ganda,
        // namun untuk kompatibilitas, saya akan kembali ke logika Anda yang menggunakan WHERE 1=1 jika perlu.
        // Untuk saat ini, saya mengasumsikan logika AND OR yang lebih aman:

        const sql = `
            SELECT 
                id, 
                message, 
                createdAt,      /* Menggunakan createdAt untuk filter */
                scheduleAt,     /* Menggunakan scheduleAt untuk waktu event */
                status, 
                deviceId, 
                contacts 
            FROM Schedules
            ${whereClause}
            ORDER BY createdAt DESC;
        `;

        const rows = await db.all(sql);

        const data = rows.map((schedule) => ({
            id: schedule.id,
            title: schedule.message.substring(0, 50) + "...", // Judul singkat
            // [PERBAIKAN KRITIS]: scheduleAt adalah ISO String/Timestamp Detik. Kita asumsikan itu adalah Unix Integer (detik) dan dikonversi ke Milidetik
            start: Number(schedule.scheduleAt) * 1000,
            allDay: false,
            status: schedule.status,
            deviceId: schedule.deviceId,
            contactsCount: JSON.parse(schedule.contacts).length || 0,
        }));

        return res.json(data);
    } catch (err) {
        console.error("Error fetching schedule details (User):", err.message);
        return res
            .status(500)
            .json({ error: err.message || "Gagal memuat detail jadwal." });
    }
};
const fetchScheduledEvents = async () => {
    try {
        const response = await axios.get("/api/schedules");
        const apiResponse = response.data;

        // 🎯 TEMPATKAN KODE MAPPING DI SINI! 🎯
        const formattedEvents = apiResponse.data.map((item) => ({
            // Properti Wajib FullCalendar:
            id: item.schedule_id,
            title: item.template_name, // Judul yang muncul di kalender
            start: item.start_time,
            end: item.end_time,

            // 👇 PROPERTI DETAIL TAMBAHAN (Sesuai kebutuhan Modal) 👇
            userId: item.user_id,
            deviceId: item.device_id,
            templateName: item.template_name,
            status: item.schedule_status,
            totalContacts: item.total_contacts,
            successCount: item.success_count,
            failedCount: item.failed_count,
            delayInSeconds: item.delay_in_seconds,
            messageBody: item.message_body,

            // Fallback (jika modal masih menggunakan nama properti lama)
            templatePesan: item.template_name,
            totalKontak: item.total_contacts,
            sukses: item.success_count,
            failed: item.failed_count,
            delay: item.delay_in_seconds,
        }));

        setEvents(formattedEvents); // Mengisi state events
    } catch (error) {
        console.error("Gagal mengambil data jadwal:", error);
    }
};

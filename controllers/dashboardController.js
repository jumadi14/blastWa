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
// ==========================
// Helper: Data User (Ambil Role & Device IDs dari DB menggunakan userId sebagai Kunci)
// ==========================
const getUserDataFromDb = async (userId) => {
    const userRow = await db.get("SELECT role FROM Users WHERE id = ?", [
        userId,
    ]);

    if (!userRow) throw new Error("User ID tidak terdaftar di database.");

    const devicesRows = await db.all(
        `SELECT d.deviceId 
         FROM UserDevices ud
         JOIN Devices d ON ud.device_id = d.id
         WHERE ud.user_id = ?`,
        [userId],
    );
    const deviceIds = devicesRows.map((row) => row.deviceId);

    console.log("userId:", userId);
    console.log("deviceIds hasil query:", deviceIds);

    return {
        role: userRow.role,
        deviceIds: deviceIds,
    };
};
// =======================================================
//                   ENDPOINT UMUM (USER BIASA)
// =======================================================

export const getMessageSummary = async (req, res) => {
    try {
        const { userId, timeframe } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);

        // ✅ Guard
        if (user.role !== "superuser" && user.deviceIds.length === 0) {
            return res.json({ totalSent: 0, totalFailed: 0, totalPending: 0 });
        }

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

export const getInboxSummary = async (req, res) => {
    try {
        const { userId, timeframe } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);

        // ✅ Guard
        if (user.role !== "superuser" && user.deviceIds.length === 0) {
            return res.json({ totalInbox: 0, totalRead: 0, totalUnread: 0 });
        }

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

export const getDeviceSummary = async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);

        // ✅ Guard
        if (user.role !== "superuser" && user.deviceIds.length === 0) {
            return res.json({ total: 0, online: 0, offline: 0 });
        }

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

        // ✅ Guard: kalau bukan superuser dan tidak punya device, return kosong
        if (user.role !== "superuser" && user.deviceIds.length === 0) {
            return res.json([]);
        }

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
        const limit = parseInt(req.query.limit) || 10;
        const { userId } = req.query;

        if (!userId) {
            return res
                .status(400)
                .json({ error: "User ID wajib ada di query parameter." });
        }

        const user = await getUserDataFromDb(userId);

        // ✅ Guard: kalau bukan superuser dan tidak punya device, return kosong
        if (user.role !== "superuser" && user.deviceIds.length === 0) {
            return res.json([]);
        }

        let deviceFilter = "";
        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            deviceFilter = `WHERE i.deviceId IN (${devices})`;
        }

        const sql = `
            SELECT i.id, i.deviceId, i.fromNumber, i.body, i.timestamp, d.phoneNumber AS deviceName
            FROM Inbox i
            LEFT JOIN Devices d ON i.deviceId = d.deviceId
            ${deviceFilter}
            ORDER BY i.timestamp DESC
            LIMIT ${limit};
        `;

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
        req.query.userId = null;

        const sql = `
            SELECT m.id, m.deviceId, m.toNumber, m.body, m.timestamp, m.status, d.phoneNumber AS deviceName
            FROM Messages m
            LEFT JOIN Devices d ON m.deviceId = d.deviceId
            ORDER BY m.timestamp DESC
            LIMIT ${limit};
        `;

        // ✅ Hapus [limit] di sini, pakai () kosong
        const rows = await db.all(sql);

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

export const getAdminRecentIncoming = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        req.query.userId = null;

        const sql = `
            SELECT i.id, i.deviceId, i.fromNumber, i.body, i.timestamp, d.phoneNumber AS deviceName
            FROM Inbox i
            LEFT JOIN Devices d ON i.deviceId = d.deviceId
            ORDER BY i.timestamp DESC
            LIMIT ${limit};
        `;

        // ✅ Hapus [limit] di sini, pakai () kosong
        const rows = await db.all(sql);

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
        req.query.userId = null;

        const { timeframe } = req.query;
        const timeFilter = getTimeFilter(timeframe);
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
                contacts,
                delay
            FROM Schedules
            ${whereClause}
            ORDER BY createdAt DESC;
        `;

        const rows = await db.all(sql);

        const data = rows.map((schedule) => ({
            id: schedule.id,
            title: schedule.message.substring(0, 50) + "...", // ✅ Dari message langsung
            start: Number(schedule.scheduleAt) * 1000,
            allDay: false,
            status: schedule.status,
            deviceId: schedule.deviceId,
            contactsCount: JSON.parse(schedule.contacts).length || 0,
            delay: (schedule.delay || 0) / 1000,
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

        // ✅ Kalau bukan superuser dan tidak punya device, return kosong
        if (user.role !== "superuser" && user.deviceIds.length === 0) {
            return res.json([]);
        }

        const timeFilter = getTimeFilter(timeframe);

        let deviceFilter = "";
        if (user.role !== "superuser" && user.deviceIds.length > 0) {
            const devices = user.deviceIds.map((d) => `'${d}'`).join(",");
            deviceFilter = `AND deviceId IN (${devices})`;
        }

        const finalTimeFilter = timeFilter.replace("timestamp", "createdAt");

        const whereClauses = [];
        if (finalTimeFilter) whereClauses.push(finalTimeFilter);
        if (deviceFilter) whereClauses.push(deviceFilter.substring(4));

        const whereClause =
            whereClauses.length > 0
                ? `WHERE ${whereClauses.join(" AND ")}`
                : "";

        const sql = `
            SELECT 
                id, 
                message, 
                createdAt,
                scheduleAt,
                status, 
                deviceId, 
                contacts,
                delay
            FROM Schedules
            ${whereClause}
            ORDER BY createdAt DESC;
        `;

        const rows = await db.all(sql);

        const data = rows.map((schedule) => ({
            id: schedule.id,
            title: schedule.message.substring(0, 50) + "...",
            start: Number(schedule.scheduleAt) * 1000,
            allDay: false,
            status: schedule.status,
            deviceId: schedule.deviceId,
            contactsCount: JSON.parse(schedule.contacts).length || 0,
            delay: (schedule.delay || 0) / 1000,
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
        console.log("userId:", userId);
        console.log("deviceIds:", user.deviceIds);
        console.log("whereClause:", whereClause);
    }
};

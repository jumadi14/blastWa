// services/inboxService.js

import db from "../models/db.js"; 

// --- FUNGSI 1: INBOX LIST (Grouped by number) ---

/**
 * Ambil daftar thread Inbox terbaru per nomor (1 pesan terakhir per fromNumber)
 * @param {string|null} deviceId - Filter device tertentu (opsional)
 * @param {Array<string>} allowedDeviceIds - Device yang boleh diakses user
 * @param {string|undefined} status - Filter isRead ('0' atau '1')
 */
export const getGroupedInboxMessages = async (deviceId, allowedDeviceIds, status) => {
    const whereClauses = [];
    const params = [];

    // Kalau allowedDeviceIds null = superuser, tidak perlu filter device
    if (allowedDeviceIds && allowedDeviceIds.length > 0) {
        const placeholders = allowedDeviceIds.map(() => "?").join(",");
        whereClauses.push(`T1.deviceId IN (${placeholders})`);
        params.push(...allowedDeviceIds);
    }

    if (deviceId) {
        whereClauses.push("T1.deviceId = ?");
        params.push(deviceId);
    }

    if (status === '0' || status === '1') {
        whereClauses.push("T1.isRead = ?");
        params.push(status);
    }

    const whereClauseString = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    try {
        const sql = `
            SELECT T1.id, T1.deviceId, T1.fromNumber, T1.body, 
                   T1.timestamp * 1000 AS timestampMs, T1.isRead
            FROM Inbox T1
            INNER JOIN (
                SELECT fromNumber, MAX(id) AS maxId
                FROM Inbox
                ${allowedDeviceIds && allowedDeviceIds.length > 0 
                    ? `WHERE deviceId IN (${allowedDeviceIds.map(() => "?").join(",")})` 
                    : ""}
                GROUP BY fromNumber
            ) T2 ON T1.id = T2.maxId
            ${whereClauseString}
            ORDER BY T1.timestamp DESC;
        `;

        const subqueryParams = allowedDeviceIds && allowedDeviceIds.length > 0 
            ? [...allowedDeviceIds] 
            : [];
            
        const rows = await db.all(sql, [...subqueryParams, ...params]);
        return rows;
    } catch (err) {
        console.error("❌ DB Error: Gagal ambil Grouped Inbox:", err.message);
        return [];
    }
};
// --- FUNGSI 2: CONVERSATION / CHAT DETAIL (Inbox + Sent) ---

export const getConversationByNumber = async (fromNumber) => {
    try {
        const sql = `
            -- Pesan Masuk (INBOX)
            SELECT 
                id, deviceId, fromNumber AS peerNumber, body, timestamp * 1000 AS timestampMs, 
                0 AS isMine, isRead, 'INBOX' AS type
            FROM Inbox
            WHERE fromNumber = ? 
            
            UNION ALL
            
            -- Pesan Keluar (SENT) - Menggunakan tabel Messages
            SELECT 
                id, deviceId, toNumber AS peerNumber, body, timestamp * 1000 AS timestampMs, 
                1 AS isMine, 1 AS isRead, 'SENT' AS type
            FROM Messages  
            WHERE toNumber = ?  
            
            ORDER BY timestampMs ASC
        `;
        
        const rows = await db.all(sql, [fromNumber, fromNumber]); 
        return rows;
    } catch (err) {
        console.error("❌ DB Error: Gagal ambil percakapan:", err.message);
        return [];
    }
};

// --- FUNGSI 3: MARKING (UPDATE isRead) ---

export const markAllMessagesAsReadByNumber = async (fromNumber) => {
    try {
        await db.run(`UPDATE Inbox SET isRead = 1 WHERE fromNumber = ?`, [fromNumber]);
        return true;
    } catch (err) {
        console.error("❌ DB Error: Gagal update status isRead:", err.message);
        throw new Error("Gagal update status baca di DB.");
    }
};

// --- FUNGSI 4: SAVING (Simpan Pesan Keluar ke DB) ---

export const saveSentMessage = async (deviceId, number, message) => {
    const timestamp = Math.floor(Date.now() / 1000); 
    try {
        await db.run(
            `INSERT INTO Messages (deviceId, toNumber, body, timestamp, status, messageId) 
             VALUES (?, ?, ?, ?, 'SENT', NULL)`, 
            [deviceId, number, message, timestamp]
        );
        return { success: true, timestampMs: timestamp * 1000 };
    } catch (err) {
        console.error("❌ DB Error: Gagal simpan pesan keluar di tabel Messages:", err.message);
        return { success: false, error: err.message };
    }
}

// --- FUNGSI 5: SENT MESSAGES LIST / HISTORY (List Semua Pesan Keluar) ---

export const getSentMessagesList = async () => { 
    try {
        const sql = `
            SELECT 
                id, deviceId, toNumber, body, timestamp * 1000 AS timestampMs, status, messageId
            FROM Messages
            ORDER BY timestamp DESC
        `;
        
        const rows = await db.all(sql, []);
        return rows;
    } catch (err) {
        console.error("❌ DB Error: Gagal ambil Sent Messages List:", err.message);
        return [];
    }
};

// --- FUNGSI 6: SENT MESSAGE DETAIL (Histori Pesan Keluar ke 1 Nomor) ---

/**
 * 🔹 Ambil semua pesan yang dikirim ke nomor tertentu (Sent Message Detail).
 */
export const getSentMessageDetailByNumber = async (toNumber) => {
    try {
        const sql = `
            SELECT 
                id, deviceId, toNumber, body, timestamp * 1000 AS timestampMs, status, messageId,
                1 AS isMine, 1 AS isRead -- Pesan keluar selalu 'milik kita'
            FROM Messages
            WHERE toNumber = ?
            ORDER BY timestamp ASC -- Urutkan dari yang lama ke yang baru
        `;
        
        const rows = await db.all(sql, [toNumber]);
        return rows;
    } catch (err) {
        console.error(`❌ DB Error: Gagal ambil Sent Message Detail ke ${toNumber}:`, err.message);
        return [];
    }
};

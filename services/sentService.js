// src/services/sentService.js (REVISI FINAL: Group By toNumber & Filter Device)
import db from '../models/db.js'; // PASTIKAN PATH INI BENAR!

/**
 * Ambil daftar thread/grup pesan terkirim (1 pesan terbaru per nomor).
 * @param {string|undefined} deviceId - Hanya ambil deviceId tertentu (jika ada)
 * @param {Array<string>|undefined} allowedDeviceIds - Device ID yang boleh diakses user (user biasa)
 * @param {string|undefined} status - Filter status pesan ('SENT', 'READ', dll)
 * @returns {Promise<Array>} Daftar thread pesan terkirim
 */
export const getSentMessageThreads = async (deviceId, allowedDeviceIds, status) => {
    let whereClauses = [];
    let params = [];

    // Filter deviceId dari query param
    if (deviceId) {
        whereClauses.push("T1.deviceId = ?");
        params.push(deviceId);
    }

    // Filter deviceId yang boleh diakses user biasa
    if (allowedDeviceIds && allowedDeviceIds.length > 0) {
        const placeholders = allowedDeviceIds.map(() => "?").join(",");
        whereClauses.push(`T1.deviceId IN (${placeholders})`);
        params.push(...allowedDeviceIds);
    }

    // Filter status (opsional)
    if (status && status !== 'ALL') {
        whereClauses.push("T1.status = ?");
        params.push(status);
    }

    const whereClauseString = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    try {
        const sql = `
            SELECT
                T1.id,
                T1.deviceId,
                T1.toNumber,
                T1.body,
                T1.timestamp AS timestampMs,
                T1.status
            FROM Messages T1
            INNER JOIN (
                SELECT
                    toNumber,
                    MAX(timestamp) AS latestTimestamp
                FROM Messages
                GROUP BY toNumber
            ) AS T2
            ON T1.toNumber = T2.toNumber AND T1.timestamp = T2.latestTimestamp
            ${whereClauseString}
            ORDER BY T1.timestamp DESC;
        `;

        const result = await db.all(sql, params);
        return result;

    } catch (error) {
        console.error("❌ ERROR QUERY THREADS (sentService):", error.message);
        throw error;
    }
};

/**
 * Ambil detail histori pesan terkirim ke satu nomor
 * @param {string} toNumber - nomor tujuan lengkap (contoh: 628123456789@c.us)
 */
export const getSentMessageDetailByNumber = async (toNumber) => {
    try {
        const sql = `
            SELECT * FROM Messages
            WHERE toNumber = ?
            ORDER BY timestamp ASC;
        `;

        const result = await db.all(sql, toNumber);
        return result;

    } catch (error) {
        console.error("❌ ERROR QUERY DETAIL (sentService):", error.message);
        throw error;
    }
};


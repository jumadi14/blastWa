// controllers/templateController.js (FILE BARU)

import db from "../models/db.js";

// Helper: Ambil template (READ ALL)
export const getTemplates = async (req, res) => {
    try {
        const rows = await db.all("SELECT * FROM Templates ORDER BY created_at DESC");
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Helper: Buat template baru (CREATE)
export const createTemplate = async (req, res) => {
    const { name, message_body } = req.body;
    if (!name || !message_body) {
        return res.status(400).json({ success: false, error: "Nama dan isi pesan wajib diisi." });
    }
    const created_at = Date.now();
    try {
        const result = await db.run(
            `INSERT INTO Templates (name, message_body, created_at) VALUES (?, ?, ?)`,
            [name, message_body, created_at]
        );
        res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: `Gagal membuat template: ${err.message}` });
    }
};

// Helper: Update template (UPDATE)
export const updateTemplate = async (req, res) => {
    const { id } = req.params;
    const { name, message_body } = req.body;
    if (!name || !message_body) {
        return res.status(400).json({ success: false, error: "Nama dan isi pesan wajib diisi." });
    }
    try {
        await db.run(
            `UPDATE Templates SET name = ?, message_body = ? WHERE id = ?`,
            [name, message_body, id]
        );
        res.json({ success: true, message: "Template berhasil diperbarui." });
    } catch (err) {
        res.status(500).json({ success: false, error: `Gagal memperbarui template: ${err.message}` });
    }
};

// Helper: Hapus template (DELETE)
export const deleteTemplate = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.run(`DELETE FROM Templates WHERE id = ?`, [id]);
        if (result.changes === 0) {
             return res.status(404).json({ success: false, error: "Template tidak ditemukan." });
        }
        res.json({ success: true, message: "Template berhasil dihapus." });
    } catch (err) {
        res.status(500).json({ success: false, error: `Gagal menghapus template: ${err.message}` });
    }
};

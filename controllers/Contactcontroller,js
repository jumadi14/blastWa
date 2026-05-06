// controllers/contactController.js
import db from "../models/db.js";
import XLSX from "xlsx";
import fs from "fs";

// ======================================================
// Helper: Cek apakah user boleh akses contact
// ======================================================
const canAccess = (userRole, contactUserId, requestUserId) => {
  if (userRole === "superuser") return true;
  return String(contactUserId) === String(requestUserId);
};

// ======================================================
// GET /api/contacts?userId=X&role=Y
// ======================================================
export const getContacts = async (req, res) => {
  try {
    const { userId, role, status, search } = req.query;

    if (!userId || !role) {
      return res.status(400).json({ success: false, message: "userId dan role wajib diisi." });
    }

    let sql = `SELECT * FROM Contacts`;
    const params = [];
    const conditions = [];

    // Filter by userId (superuser lihat semua, user biasa lihat miliknya)
    if (role !== "superuser") {
      conditions.push(`userId = ?`);
      params.push(userId);
    }

    // Filter by status
    if (status && status !== "ALL") {
      conditions.push(`status = ?`);
      params.push(status);
    }

    // Filter by search (nama atau hp)
    if (search) {
      conditions.push(`(nama LIKE ? OR hp LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += ` ORDER BY createdAt DESC`;

    const contacts = await db.all(sql, params);
    return res.json({ success: true, data: contacts, total: contacts.length });
  } catch (err) {
    console.error("❌ getContacts error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ======================================================
// POST /api/contacts — Tambah kontak manual
// ======================================================
export const createContact = async (req, res) => {
  try {
    const { nama, hp, note, userId } = req.body;

    if (!nama || !hp || !userId) {
      return res.status(400).json({ success: false, message: "nama, hp, dan userId wajib diisi." });
    }

    // Normalisasi nomor HP
    let normalizedHp = String(hp).replace(/\D/g, "");
    if (normalizedHp.startsWith("0")) {
      normalizedHp = "62" + normalizedHp.slice(1);
    }

    // Cek duplikat
    const existing = await db.get(`SELECT id FROM Contacts WHERE hp = ?`, [normalizedHp]);
    if (existing) {
      return res.status(409).json({ success: false, message: `Nomor ${normalizedHp} sudah terdaftar.` });
    }

    await db.run(
      `INSERT INTO Contacts (nama, hp, note, userId) VALUES (?, ?, ?, ?)`,
      [nama, normalizedHp, note || null, userId]
    );

    return res.status(201).json({ success: true, message: "Kontak berhasil ditambahkan." });
  } catch (err) {
    console.error("❌ createContact error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ======================================================
// PUT /api/contacts/:id — Update kontak
// ======================================================
export const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, hp, note, status, proses, userId, role } = req.body;

    const contact = await db.get(`SELECT * FROM Contacts WHERE id = ?`, [id]);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Kontak tidak ditemukan." });
    }

    if (!canAccess(role, contact.userId, userId)) {
      return res.status(403).json({ success: false, message: "Akses ditolak." });
    }

    // Normalisasi nomor HP jika diubah
    let normalizedHp = hp ? String(hp).replace(/\D/g, "") : contact.hp;
    if (normalizedHp.startsWith("0")) {
      normalizedHp = "62" + normalizedHp.slice(1);
    }

    await db.run(
      `UPDATE Contacts SET nama = ?, hp = ?, note = ?, status = ?, proses = ? WHERE id = ?`,
      [
        nama || contact.nama,
        normalizedHp,
        note !== undefined ? note : contact.note,
        status || contact.status,
        proses !== undefined ? proses : contact.proses,
        id
      ]
    );

    return res.json({ success: true, message: "Kontak berhasil diupdate." });
  } catch (err) {
    console.error("❌ updateContact error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ======================================================
// DELETE /api/contacts/:id — Hapus kontak
// ======================================================
export const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.query;

    const contact = await db.get(`SELECT * FROM Contacts WHERE id = ?`, [id]);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Kontak tidak ditemukan." });
    }

    if (!canAccess(role, contact.userId, userId)) {
      return res.status(403).json({ success: false, message: "Akses ditolak." });
    }

    await db.run(`DELETE FROM Contacts WHERE id = ?`, [id]);
    return res.json({ success: true, message: "Kontak berhasil dihapus." });
  } catch (err) {
    console.error("❌ deleteContact error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ======================================================
// DELETE /api/contacts/bulk — Hapus banyak kontak
// ======================================================
export const deleteContactsBulk = async (req, res) => {
  try {
    const { ids, userId, role } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "ids wajib diisi." });
    }

    // Superuser bisa hapus semua, user biasa hanya miliknya
    let sql = `DELETE FROM Contacts WHERE id IN (${ids.map(() => "?").join(",")})`;
    const params = [...ids];

    if (role !== "superuser") {
      sql += ` AND userId = ?`;
      params.push(userId);
    }

    const result = await db.run(sql, params);
    return res.json({ success: true, message: `${result.changes} kontak berhasil dihapus.` });
  } catch (err) {
    console.error("❌ deleteContactsBulk error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ======================================================
// POST /api/contacts/import — Import dari Excel
// ======================================================
export const importContacts = async (req, res) => {
  try {
    const { userId, note } = req.body;
    const file = req.file;

    if (!file || !userId) {
      return res.status(400).json({ success: false, message: "File Excel dan userId wajib diisi." });
    }

    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    if (data.length < 2) {
      return res.status(400).json({ success: false, message: "File Excel kosong atau hanya berisi header." });
    }

    const headers = data[0].map(h => String(h).trim().toLowerCase());
    const namaIndex = headers.findIndex(h => h === "nama");
    const hpIndex = headers.findIndex(h => h === "hp");

    if (namaIndex === -1 || hpIndex === -1) {
      return res.status(400).json({
        success: false,
        message: `Header tidak valid. Diperlukan kolom 'Nama' dan 'HP'. Ditemukan: ${data[0].join(", ")}`
      });
    }

    const dataRows = data.slice(1);
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const row of dataRows) {
      const nama = String(row[namaIndex] || "").trim();
      const rawHp = row[hpIndex];

      if (!nama || !rawHp) continue;

      // Normalisasi nomor
      let hp = String(rawHp).replace(/\D/g, "");
      if (hp.startsWith("0")) hp = "62" + hp.slice(1);

      if (hp.length < 8) {
        errors.push(`Nomor ${rawHp} tidak valid, dilewati.`);
        skipped++;
        continue;
      }

      try {
        // Cek duplikat — skip kalau sudah ada
        const existing = await db.get(`SELECT id FROM Contacts WHERE hp = ?`, [hp]);
        if (existing) {
          skipped++;
          continue;
        }

        await db.run(
          `INSERT INTO Contacts (nama, hp, note, userId) VALUES (?, ?, ?, ?)`,
          [nama, hp, note || null, userId]
        );
        imported++;
      } catch (e) {
        skipped++;
        errors.push(`Gagal import ${nama} (${hp}): ${e.message}`);
      }
    }

    // Hapus file upload setelah selesai
    fs.unlink(file.path, () => {});

    return res.json({
      success: true,
      message: `Import selesai. ${imported} kontak berhasil, ${skipped} dilewati.`,
      imported,
      skipped,
      errors: errors.slice(0, 10) // Tampilkan max 10 error
    });
  } catch (err) {
    console.error("❌ importContacts error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ======================================================
// POST /api/contacts/reset-status — Reset status untuk blast ulang
// ======================================================
export const resetContactStatus = async (req, res) => {
  try {
    const { ids, userId, role } = req.body;

    let sql = `UPDATE Contacts SET status = 'BELUM', proses = NULL`;
    const params = [];

    if (ids && Array.isArray(ids) && ids.length > 0) {
      sql += ` WHERE id IN (${ids.map(() => "?").join(",")})`;
      params.push(...ids);
      if (role !== "superuser") {
        sql += ` AND userId = ?`;
        params.push(userId);
      }
    } else {
      if (role !== "superuser") {
        sql += ` WHERE userId = ?`;
        params.push(userId);
      }
    }

    const result = await db.run(sql, params);
    return res.json({ success: true, message: `${result.changes} kontak direset.` });
  } catch (err) {
    console.error("❌ resetContactStatus error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 📁 controllers/schedulerController.js

import { readContacts } from "../services/excelService.js";
import { sendScheduledMessages } from "../services/schedulerService.js";
import fs from "fs";

// Helper untuk log tapi tidak hapus
const safeUnlink = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    console.log(`[File System INFO] File tersimpan: ${filePath}`);
  } else {
    console.warn(`[File System WARNING] File tidak ditemukan: ${filePath}`);
  }
};

// Controller utama
export const sendBulkController = async (req, res) => {
  const { deviceId, message, delay, scheduleAt, templateId } = req.body;
  console.log("req.body:", req.body);
  console.log("templateId diterima:", templateId);

  // Ambil dua file: Excel & lampiran (opsional)
  const excelFile = req.files?.excelFile?.[0];
  const attachmentFile = req.files?.attachmentFile?.[0]; // nama sama dengan frontend

  // Validasi wajib
  if (!deviceId || !message || !excelFile) {
    return res.status(400).json({
      success: false,
      error: "Device ID, Pesan, dan File Excel wajib diisi.",
    });
  }

  const filePath = excelFile.path;
  let scheduleAtTimestamp = null;

  try {
    // 1️⃣ Baca kontak dari Excel
    const contacts = readContacts(filePath);
    console.log(
      `[Excel Service] Berhasil membaca ${contacts.length} kontak dari ${filePath}`,
    );

    // 2️⃣ Konversi waktu ke timestamp UNIX (detik)
    if (scheduleAt && scheduleAt !== "") {
      scheduleAtTimestamp = Math.floor(new Date(scheduleAt).getTime() / 1000);
      if (isNaN(scheduleAtTimestamp)) {
        throw new Error("Format waktu 'scheduleAt' tidak valid.");
      }
    }

    // 3️⃣ Path lampiran opsional (foto/dokumen)
    const imagePath = attachmentFile ? attachmentFile.path : null;

    if (imagePath) {
      console.log(`[Lampiran] File ditemukan di: ${imagePath}`);
    } else {
      console.log("[Lampiran] Tidak ada file lampiran dikirim.");
    }

    // 4️⃣ Proses kirim pesan terjadwal
    const result = await sendScheduledMessages(
      deviceId,
      contacts,
      message,
      parseInt(delay) || 3000,
      scheduleAtTimestamp,
      imagePath,
      templateId, // ✅ TAMBAH INI
    );

    // 5️⃣ Respon sukses ke frontend
    res.status(200).json({
      success: true,
      message: result.message,
      contactCount: result.contactCount,
      scheduleAt: result.scheduleAt || null,
      info: {
        excelFile: excelFile.originalname,
        attachmentFile: attachmentFile ? attachmentFile.originalname : null,
      },
    });

    // Catatan log saja (tidak hapus file)
    console.log(
      `[INFO] File Excel dan lampiran disimpan permanen di folder uploads/`,
    );
  } catch (err) {
    console.error("❌ Error di sendBulkController:", err.message);

    res.status(500).json({
      success: false,
      error: `Gagal memproses pengiriman: ${err.message}`,
    });
  }
};

// Ambil detail jadwal berdasarkan ID
export const getScheduleDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const schedule = await db.get(`SELECT * FROM Schedules WHERE id = ?`, [id]);

    if (!schedule) {
      return res
        .status(404)
        .json({ success: false, message: "Jadwal tidak ditemukan." });
    }

    // Kalau kolom contacts-nya disimpan dalam JSON string, parse dulu:
    schedule.contacts = JSON.parse(schedule.contacts || "[]");

    res.status(200).json({
      success: true,
      data: schedule,
      delayInSeconds: schedule.delay || 0,
    });
  } catch (err) {
    console.error("❌ Gagal mengambil detail jadwal:", err.message);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

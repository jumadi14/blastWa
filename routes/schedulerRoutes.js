// 📁 routes/schedulerRoutes.js (ESM VERSION ✅)

import express from "express";
import multer from "multer";
import path from "path";
import { sendBulkController } from "../controllers/schedulerController.js";

const router = express.Router();

// ===========================
// Konfigurasi Upload
// ===========================
const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 20 * 1024 * 1024 }, // maksimal 20MB
});

// ===========================
// Route: Kirim Pesan Massal
// ===========================
// - excelFile: hanya untuk dibaca (data kontak)
// - attachmentFile: dikirim sebagai lampiran pesan
router.post(
  "/send-bulk",
  upload.fields([
    { name: "excelFile", maxCount: 1 },
    { name: "attachmentFile", maxCount: 1 },
  ]),
  sendBulkController
);


// ✅ Ambil semua jadwal dari tabel Schedules
router.get("/", async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM Schedules ORDER BY scheduleAt DESC`);
    res.json(rows);
  } catch (err) {
    console.error("❌ Gagal ambil data jadwal:", err.message);
    res.status(500).json({ error: "Gagal ambil data jadwal." });
  }
});



export default router;


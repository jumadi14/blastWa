// routes/contactRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  deleteContactsBulk,
  importContacts,
  resetContactStatus,
} from "../controllers/contactController.js";

const router = express.Router();

// Upload config untuk import Excel
const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB
});

// GET /api/contacts?userId=X&role=Y&status=BELUM&search=xxx
router.get("/", getContacts);

// POST /api/contacts — Tambah manual
router.post("/", createContact);

// POST /api/contacts/import — Import dari Excel
router.post("/import", upload.single("excelFile"), importContacts);

// POST /api/contacts/bulk-delete — Hapus banyak sekaligus
router.post("/bulk-delete", deleteContactsBulk);

// POST /api/contacts/reset-status — Reset status kontak
router.post("/reset-status", resetContactStatus);

// PUT /api/contacts/:id — Update kontak
router.put("/:id", updateContact);

// DELETE /api/contacts/:id?userId=X&role=Y — Hapus kontak
router.delete("/:id", deleteContact);

export default router;

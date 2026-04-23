import db from "../models/db.js";
import bcrypt from "bcryptjs";

/**
 * 🧩 REGISTER USER BARU
 * ----------------------------------------------------
 * Endpoint: POST /api/user/register
 */
export const registerUser = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
    }

    // Cek duplikat username
    const existing = await db.get("SELECT * FROM Users WHERE username = ?", [username]);
    if (existing) {
      return res.status(400).json({ success: false, message: "Username sudah terdaftar." });
    }

    // Enkripsi password
    const hashed = await bcrypt.hash(password, 10);
    const userRole = role === "superuser" ? "superuser" : "user";

    await db.run("INSERT INTO Users (username, password, role) VALUES (?, ?, ?)", [
      username,
      hashed,
      userRole,
    ]);

    res.status(201).json({ success: true, message: "User berhasil dibuat." });
  } catch (err) {
    console.error("❌ Error registerUser:", err.message);
    res.status(500).json({ success: false, message: "Gagal membuat user." });
  }
};

/**
 * 🔑 LOGIN USER
 * ----------------------------------------------------
 * Endpoint: POST /api/user/login
 * Jika berhasil, simpan data user ke req.session.user
 */
export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
    }

    const user = await db.get("SELECT * FROM Users WHERE username = ?", [username]);
    if (!user) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Password salah." });
    }

    // Simpan ke session tanpa expired (cookie abadi)
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    res.json({
      success: true,
      message: `Selamat datang, ${user.username}!`,
      user: req.session.user,
    });
  } catch (err) {
    console.error("❌ Error loginUser:", err.message);
    res.status(500).json({ success: false, message: "Gagal login." });
  }
};

/**
 * 🚪 LOGOUT USER
 * ----------------------------------------------------
 * Endpoint: POST /api/user/logout
 * Hapus data session
 */
export const logoutUser = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Error destroy session:", err);
        return res.status(500).json({ success: false, message: "Gagal logout." });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Berhasil logout." });
    });
  } catch (err) {
    console.error("❌ Error logoutUser:", err.message);
    res.status(500).json({ success: false, message: "Terjadi kesalahan saat logout." });
  }
};

/**
 * 👤 GET USER SAAT INI
 * ----------------------------------------------------
 * Endpoint: GET /api/user/me
 */
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ success: false, message: "Belum login." });
    }

    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error("❌ Error getCurrentUser:", err.message);
    res.status(500).json({ success: false, message: "Gagal mengambil data user." });
  }
};


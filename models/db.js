// models/db.js
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

// Konfigurasi Koneksi ke Aiven MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  // TAMBAHKAN INI BIAR GAK TIMEOUT
  connectTimeout: 20000, // Tunggu 20 detik saat koneksi awal
  acquireTimeout: 20000, // Tunggu 20 detik saat ambil koneksi dari pool
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

const db = {
  // Mengambil 1 baris data
  get: async (sql, params) => {
    const [rows] = await pool.execute(sql, params);
    return rows[0];
  },
  // Mengambil banyak baris data
  all: async (sql, params) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
  },
  // Menjalankan perintah Insert, Update, Delete
  run: async (sql, params) => {
    const [result] = await pool.execute(sql, params);
    return { lastID: result.insertId, changes: result.affectedRows };
  },
  // Menjalankan query mentah
  exec: async (sql) => {
    return await pool.query(sql);
  }
};

// ======================================================
// 🔐 INISIALISASI ADMIN DEFAULT
// ======================================================
async function initDefaultUser() {
  try {
    // Cek apakah tabel Users sudah ada isinya
    const row = await db.get(`SELECT COUNT(*) AS count FROM Users`);
    
    // Jika kosong, buatkan user admin default (ID 1)
    if (row && (row.count === 0 || row['COUNT(*)'] === 0)) {
      const hashed = await bcrypt.hash("admin123", 10);
      await db.run(
        `INSERT INTO Users (username, password, role, createdAt) VALUES (?, ?, ?, ?)`,
        ["admin", hashed, "superuser", Math.floor(Date.now() / 1000)]
      );
      console.log("✅ User admin default (ID 1) berhasil ditambahkan.");
    }
  } catch (err) {
    // Abaikan error jika tabel belum siap saat booting
    console.log("ℹ️ Database terhubung. Sistem siap digunakan.");
  }
}

// Jalankan pengecekan admin saat backend start
initDefaultUser();

export default db;

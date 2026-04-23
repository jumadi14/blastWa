import db from "../models/db.js";
import bcrypt from "bcryptjs";

// Fungsi utilitas untuk memeriksa duplikasi username
async function isUsernameTaken(username) {
  const user = await db.get("SELECT 1 FROM Users WHERE username = ?", [username]);
  return !!user;
}

// === LOGIN USER ===
export async function login(req, res) {
    try {
        const { username, password } = req.body;

        // Validasi input dasar
        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
        }

        // Cek apakah user ada
        const user = await db.get("SELECT * FROM Users WHERE username = ?", [username]);
        if (!user) {
            // Berikan pesan error generik untuk keamanan (tidak mengungkap user ada/tidak)
            return res.status(401).json({ success: false, message: "Username atau Password salah." });
        }

        // Cek password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            // Pesan error generik
            return res.status(401).json({ success: false, message: "Username atau Password salah." });
        }

        // Response (Jangan mengirim password)
        res.json({
            success: true,
            message: "Login berhasil",
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                // Tambahkan token JWT di sini jika Anda menggunakannya
            },
        });
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
    }
}

// === REGISTER / CREATE USER ===
export async function createUser(req, res) {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: "Data (username, password, role) tidak boleh kosong." });
        }
        
        // REVISI: Cek duplikasi username
        if (await isUsernameTaken(username)) {
            return res.status(409).json({ success: false, message: "Username sudah digunakan." });
        }
        
        const hashed = await bcrypt.hash(password, 10);

        await db.run(
            "INSERT INTO Users (username, password, role, createdAt) VALUES (?, ?, ?, ?)",
            [username, hashed, role, Date.now()]
        );

        res.status(201).json({ success: true, message: "User berhasil dibuat." }); // Status 201 Created
    } catch (error) {
        console.error("❌ Register error:", error.message);
        // Tangani jika error adalah karena constraint unik (jika tidak menggunakan isUsernameTaken)
        res.status(500).json({ success: false, message: "Gagal membuat user." });
    }
}

// === GET USERS (REVISI: Mendukung Superuser dan User Biasa) ===
export async function getUsers(req, res) {
    try {
        // Ambil query params dari frontend
        const { role: accessRole, id: userId } = req.query; 

        let sqlQuery = "SELECT id, username, role FROM Users";
        let params = [];
        let users;

        if (accessRole === 'all') {
            // Case 1: Superuser (Dapat melihat semua user)
            sqlQuery += " ORDER BY id ASC";
            users = await db.all(sqlQuery, params);
            
        } else if (userId) {
            // Case 2: User biasa (Hanya melihat data dirinya)
            sqlQuery += " WHERE id = ?";
            params.push(userId);
            
            const user = await db.get(sqlQuery, params);
            if (!user) {
                return res.status(404).json({ success: false, message: "Data user tidak ditemukan." });
            }
            // Mengembalikan objek tunggal (untuk konsistensi fetch single user)
            return res.json(user); 
        } else {
            // Case 3: Unauthorized / Query tidak lengkap
            return res.status(403).json({ success: false, message: "Akses ditolak atau parameter tidak valid." });
        }
        
        res.json(users);

    } catch (error) {
        console.error("❌ Get users error:", error.message);
        res.status(500).json({ success: false, message: "Gagal mengambil daftar user." });
    }
}

// === UPDATE PASSWORD USER ===
export async function updateUserPassword(req, res) {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password) return res.status(400).json({ success: false, message: "Password baru wajib diisi." });

        const hashed = await bcrypt.hash(password, 10);

        const result = await db.run("UPDATE Users SET password = ? WHERE id = ?", [hashed, id]);

        if (result.changes === 0) {
             return res.status(404).json({ success: false, message: "User tidak ditemukan untuk diperbarui." });
        }

        res.json({ success: true, message: "Password berhasil diperbarui." });
    } catch (error) {
        console.error("❌ Update password error:", error.message);
        res.status(500).json({ success: false, message: "Gagal memperbarui password." });
    }
}
// === DELETE USER (REVISI LOGGING) ===
export async function deleteUser(req, res) {
    try {
        const { id } = req.params;

        // Logging: Cek ID yang diterima dari URL
        console.log(`ATTEMPTING DELETE for User ID: ${id}`); 

        // db.run untuk operasi DELETE
        const result = await db.run("DELETE FROM Users WHERE id = ?", [id]);

        // Logging: Cek berapa baris yang terpengaruh
        console.log(`DELETE result: ${result.changes} rows affected.`); 

        if (result.changes === 0) {
            // Jika 0 baris terhapus, kembalikan 404 (Not Found)
            return res.status(404).json({ success: false, message: "User tidak ditemukan untuk dihapus. (ID tidak valid atau sudah terhapus)" });
        }

        // Jika berhasil, kembalikan 200 OK
        res.json({ success: true, message: `User dengan ID ${id} berhasil dihapus.` });
    } catch (error) {
        console.error("❌ Delete user error:", error.message);
        res.status(500).json({ success: false, message: "Gagal menghapus user karena kesalahan server." });
    }
}

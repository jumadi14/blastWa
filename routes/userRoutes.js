// 📁 routes/userRoutes.js 
import express from "express";

// 🧠 Controllers
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  listAllUsers, // hanya superuser bisa, dicek langsung di controller
} from "../controllers/userController.js";

const router = express.Router();

/**
 * 📝 REGISTER USER
 * POST /api/user/register
 */
router.post("/register", registerUser);

/**
 * 🔑 LOGIN USER
 * POST /api/user/login
 */
router.post("/login", loginUser);

/**
 * 🚪 LOGOUT USER
 * POST /api/user/logout
 */
router.post("/logout", logoutUser);

/**
 * 👤 CEK USER AKTIF
 * GET /api/user/me
 */
router.get("/me", getCurrentUser);

/**
 * 👥 AMBIL SEMUA USER (hanya superuser)
 * GET /api/user/
 */
router.get("/", listAllUsers);

export default router;


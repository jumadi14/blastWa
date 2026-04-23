// routes/authRoutes.js

import express from "express";
// Import deleteUser
import { login, createUser, getUsers, updateUserPassword, deleteUser } from "../controllers/authController.js";

const router = express.Router();
router.post("/login", login);
router.post("/register", createUser);
router.get("/users", getUsers);
router.put("/users/:id", updateUserPassword);
router.delete("/users/:id", deleteUser); // <-- Endpoint DELETE

export default router;

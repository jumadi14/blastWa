import express from "express";
const router = express.Router();

// Import Controllers
import { getInbox } from "../controllers/inboxController.js";
import { getConversation, replyMessage } from "../controllers/conversationController.js";

// --- DAFTAR ROUTES INBOX ---

// GET /api/inbox → List Thread Grouped
router.get("/", getInbox);

// GET /api/inbox/conversation/:fromNumber → Detail Chat
router.get("/conversation/:fromNumber", getConversation);

// POST /api/inbox/reply/:fromNumber → Kirim Balasan
router.post("/reply/:fromNumber", replyMessage);

export default router;


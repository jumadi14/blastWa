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

app.get('/api/debug/inbox-schema', async (req, res) => {
  3     try {
  4         const rows = await db.all("PRAGMA table_info(Inbox);");
  5         res.json({ success: true, data: rows });
  6     } catch (err) {
  7         res.status(500).json({ success: false, error: err.message });
  8     }
  9 });


export default router;


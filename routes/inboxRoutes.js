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
router.get("/debug-schema", async (req, res) => {
     try {
           const rows = await db.all("PRAGMA table_info(Inbox);");
        res.json({ success: true, data: rows });
       } catch (err) {
           res.status(500).json({ success: false, error: err.message });
       }
   });



export default router;


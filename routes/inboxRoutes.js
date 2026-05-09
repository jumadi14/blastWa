import express from "express";
const router = express.Router();

// Import Controllers
import { getInbox } from "../controllers/inboxController.js";
import { getConversation, replyMessage } from "../controllers/conversationController.js";
import db from "../models/db.js";


// --- DAFTAR ROUTES INBOX ---

// GET /api/inbox → List Thread Grouped
router.get("/", getInbox);

// GET /api/inbox/conversation/:fromNumber → Detail Chat
router.get("/conversation/:fromNumber", getConversation);

// POST /api/inbox/reply/:fromNumber → Kirim Balasan
router.post("/reply/:fromNumber", replyMessage);


 router.get("/debug-schema", async (req, res) => {
       try {
           const rows = await db.all("DESCRIBE Inbox", []);
           res.json({ success: true, data: rows });
       } catch (err) {
           console.error("Error:", err);
           res.status(500).json({ success: false, error: err.message });
       }
   });
router.get("/debug-sample", async (req, res) => {
  2     try {
  3         const rows = await db.all("SELECT id, deviceId, fromNumber, body, timestamp FROM Inbox ORDER BY id DESC LIMIT 5", []);
  4         res.json({ success: true, data: rows });
  5     } catch (err) {
  6         res.status(500).json({ success: false, error: err.message });
  7     }
  8 });





export default router;


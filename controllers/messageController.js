// controllers/messageController.js
import db from "../models/db.js";
import { sendMessageService } from "../services/whatsappService.js";

export const getInbox = async (req, res) => {
  const rows = await db.all("SELECT * FROM Inbox ORDER BY timestamp DESC");
  res.json({ success: true, data: rows });
};

export const getOutbox = async (req, res) => {
  const rows = await db.all("SELECT * FROM Messages ORDER BY timestamp DESC");
  res.json({ success: true, data: rows });
};

export const sendMessageController = async (req, res) => {
  const { deviceId, number, message } = req.body;
  try {
    const result = await sendMessageService(deviceId, number, message);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


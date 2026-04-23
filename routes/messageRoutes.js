import express from "express";
import { getOutbox, sendMessageController } from "../controllers/messageController.js";
const router = express.Router();
router.get("/", getOutbox);
router.post("/send", sendMessageController);
export default router;


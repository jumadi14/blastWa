// controllers/conversationController.js

import { getConversationByNumber, saveSentMessage, markAllMessagesAsReadByNumber } from "../services/inboxService.js";
// Ganti path jika berbeda
import { sendMessageService } from "../services/whatsappService.js"; 

/** 🔹 Ambil semua riwayat pesan (GET /api/inbox/conversation/:fromNumber) */
export const getConversation = async (req, res) => {
    try {
        const { fromNumber } = req.params; 
        
        if (!fromNumber) {
             return res.status(400).json({ success: false, message: "fromNumber wajib diisi." });
        }

        const messages = await getConversationByNumber(fromNumber);
        
        // Tandai semua pesan sebagai sudah dibaca
        markAllMessagesAsReadByNumber(fromNumber).catch(err => {
             console.warn("Gagal otomatis menandai pesan sebagai sudah dibaca:", err.message);
        });
        
        res.json({ success: true, data: messages });
    } catch (err) {
        console.error("❌ Gagal ambil percakapan:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

/** 🔹 Kirim balasan dan simpan ke DB (POST /api/inbox/reply/:fromNumber) */
export const replyMessage = async (req, res) => {
    try {
        const { fromNumber } = req.params; 
        const { deviceId, message } = req.body; 

        if (!deviceId || !message) {
            return res.status(400).json({ success: false, message: "deviceId dan message wajib diisi." });
        }

        // 1. Kirim pesan via WhatsApp Service
        const waResult = await sendMessageService(deviceId, fromNumber, message);

        // 2. Simpan pesan yang baru dikirim ke tabel Messages
        const dbSaveResult = await saveSentMessage(deviceId, fromNumber, message);

        res.json({ 
            success: true, 
            message: "Pesan berhasil dibalas dan disimpan.",
            whatsappResult: waResult, 
            dbSaveResult: dbSaveResult 
        });

    } catch (err) {
        console.error("❌ Gagal kirim balasan:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// controllers/sentMessageController.js
import { getSentMessageThreads } from "../services/sentService.js";

/**
 * GET /api/sent
 * 🔹 Ambil daftar thread pesan terkirim
 * 🔹 userId & role wajib dikirim di query params
 * 🔹 superuser → semua device
 * 🔹 user → hanya device miliknya
 * 🔹 deviceId opsional untuk filter spesifik
 */
export const getSentMessagesController = async (req, res) => {
  try {
    const { userId, role, deviceId } = req.query;

    if (!userId || !role) {
      return res.status(400).json({
        success: false,
        message: "userId dan role wajib dikirim (query params)"
      });
    }

    // Tentukan device filter untuk service
    let deviceFilter = undefined;

    if (role === "user") {
      // user hanya boleh melihat device miliknya
      deviceFilter = deviceId && deviceId !== 'ALL' ? deviceId : undefined;
    } else if (role === "superuser") {
      // superuser boleh filter device, tapi optional
      deviceFilter = deviceId && deviceId !== 'ALL' ? deviceId : undefined;
    }

    const messages = await getSentMessageThreads(userId, role, deviceFilter);

    res.json({
      success: true,
      data: messages,
      message: `Berhasil mengambil ${messages.length} thread pesan terkirim.`
    });

  } catch (err) {
    console.error("❌ Gagal mengambil daftar thread pesan terkirim:", err.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar thread pesan terkirim. Cek log server."
    });
  }
};


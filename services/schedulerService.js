// 📁 services/schedulerService.js (Kode Final dengan Mutex)

import { sendMessageService } from "./whatsappService.js";
import db from "../models/db.js";

// 🛑 VARIABEL BARU: Melacak apakah worker sedang aktif memproses (Mutex)
let isProcessingTasks = false;

// --------------------------------------------------------
// FUNGSI UTAMA UNTUK MENYIMPAN JADWAL
// --------------------------------------------------------
export const saveScheduledTask = async (task) => {
    const contactsJson = JSON.stringify(task.contacts);
    const timestamp = Math.floor(Date.now() / 1000);

    try {
        await db.run(
            `INSERT INTO Schedules (deviceId, contacts, message, delay, scheduleAt, imagePath, status, createdAt, templateId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                task.deviceId,
                contactsJson,
                task.message,
                task.delay,
                task.scheduleAt,
                task.imagePath,
                "PENDING",
                timestamp,
                task.templateId || null, // ✅ TAMBAH INI
            ],
        );
        console.log(
            `⏳ Pesan Blast berhasil disimpan, dijadwalkan pada ${task.scheduleAt}`,
        );
    } catch (err) {
        console.error("❌ Gagal menyimpan jadwal ke DB:", err.message);
        throw new Error("Database error during scheduling.");
    }
};

// --------------------------------------------------------
// FUNGSI INTI SEND MESSAGES
// --------------------------------------------------------
export const sendImmediateBlast = async (
    deviceId,
    contacts,
    message,
    delay = 3000,
    imagePath = null,
    scheduleId = null, // ✅ TAMBAH INI
) => {
    for (const contact of contacts) {
        const rawNumber = contact.hp;

        if (!rawNumber) {
            console.warn(
                `⚠️ Nomor kosong, skip: ${contact.nama || "Tidak ada Nama"}`,
            );
            continue;
        }

        let formattedNumber = String(rawNumber).replace(/\D/g, "");
        formattedNumber = formattedNumber.startsWith("0")
            ? "62" + formattedNumber.slice(1)
            : formattedNumber;
        formattedNumber += "@c.us";

        const name = contact.nama || "Teman";
        const personalizedMessage = message.replace("{{nama}}", name);

        try {
            await sendMessageService(
                deviceId,
                formattedNumber,
                personalizedMessage,
                imagePath,
                scheduleId, // ✅ TAMBAH INI
            );
            console.log(`✅ Pesan terkirim ke ${name} (${formattedNumber})`);
        } catch (err) {
            console.error(
                `❌ Gagal kirim ke ${name} (${formattedNumber}):`,
                err.message,
            );
        }

        if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
        }
    }
};

// --------------------------------------------------------
// FUNGSI WORKER CORE LOGIC (DIPERBAIKI DENGAN MUTEX)
// --------------------------------------------------------
export const processDueTasks = async () => {
    // 1. KUNCI SEDERHANA (MUTEX): Cegah pemanggilan ganda/bentrok DB
    if (isProcessingTasks) {
        console.log("⏱️ Worker sedang sibuk, melewati interval ini.");
        return;
    }

    isProcessingTasks = true; // Set status menjadi sedang berjalan
    const currentTimestamp = Math.floor(Date.now() / 1000);

    let dueTasks = [];
    try {
        dueTasks = await db.all(
            `SELECT * FROM Schedules WHERE status = 'PENDING' AND scheduleAt <= ?`,
            [currentTimestamp],
        );
    } catch (err) {
        console.error("❌ Gagal mengambil tugas jatuh tempo:", err.message);
        isProcessingTasks = false; // Reset status saat gagal ambil data
        return;
    }

    if (dueTasks.length === 0) {
        isProcessingTasks = false; // Reset status jika tidak ada tugas
        return;
    }

    console.log(
        `🔔 DITEMUKAN ${dueTasks.length} tugas jatuh tempo. Mulai proses pengiriman...`,
    );

    try {
        for (const task of dueTasks) {
            // Operasi DB Pertama yang bisa bentrok
            await db.run(
                `UPDATE Schedules SET status = 'PROCESSING' WHERE id = ?`,
                [task.id],
            );

            let errorMessage = null;
            try {
                const contacts = JSON.parse(task.contacts);
                await sendImmediateBlast(
                    task.deviceId,
                    contacts,
                    task.message,
                    task.delay,
                    task.imagePath,
                    task.id, // ✅ TAMBAH INI (task.id = scheduleId)
                );
            } catch (err) {
                console.error(
                    `❌ Gagal memproses tugas ID ${task.id}:`,
                    err.message,
                );
                errorMessage = err.message;
            } finally {
                // Operasi DB Kedua yang bisa bentrok
                const finalStatus = errorMessage ? "FAILED" : "COMPLETED";
                await db.run(
                    `UPDATE Schedules SET status = ?, errorMessage = ? WHERE id = ?`,
                    [finalStatus, errorMessage, task.id],
                );
                if (!errorMessage) {
                    console.log(
                        `✅ Tugas jadwal ID ${task.id} selesai dikirim.`,
                    );
                }
            }
        }
        console.log("✅ Semua tugas jatuh tempo telah selesai diproses.");
    } catch (err) {
        console.error(
            "🔥 ERROR FATAL saat looping tugas jatuh tempo:",
            err.message,
        );
    } finally {
        // 2. RESET STATUS: Selalu reset status, bahkan jika terjadi error.
        isProcessingTasks = false;
    }
};

// --------------------------------------------------------
// FUNGSI UTAMA (sendScheduledMessages)
// --------------------------------------------------------
export const sendScheduledMessages = async (
    deviceId,
    contacts,
    message,
    delay = 3000,
    scheduleAt = null,
    imagePath = null,
    templateId = null,
) => {
    if (!contacts || contacts.length === 0) {
        throw new Error("Daftar kontak kosong atau tidak valid.");
    }

    if (scheduleAt) {
        const taskPayload = {
            deviceId,
            contacts,
            message,
            delay,
            scheduleAt,
            imagePath,
            templateId,
        }; // ✅ tambah templateId
        await saveScheduledTask(taskPayload);
        return {
            message: "Task successfully scheduled",
            scheduleAt,
            contactCount: contacts.length,
        };
    }

    await sendImmediateBlast(deviceId, contacts, message, delay, imagePath);
    return { message: "Bulk sending completed", contactCount: contacts.length };
};
// --------------------------------------------------------
// FUNGSI STARTER WORKER (Tambahkan ini)
// --------------------------------------------------------
const WORKER_INTERVAL_MS = 30000; // 30 detik

export const startScheduleWorker = () => {
    // Jalankan Worker pertama kali segera
    processDueTasks();

    // Set Interval untuk mengulang setiap 30 detik
    setInterval(() => {
        processDueTasks();
    }, WORKER_INTERVAL_MS);

    console.log(
        `⏱️ Scheduler Worker aktif, memproses tugas setiap ${WORKER_INTERVAL_MS / 1000} detik.`,
    );
};

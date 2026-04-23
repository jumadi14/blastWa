// services/excelService.js

import XLSX from "xlsx";
import fs from "fs"; 

/**
 * Format nomor WA ke standar yang dibutuhkan untuk pengiriman (628...).
 * @param {string | number} num Nilai nomor telepon dari Excel.
 * @returns {string} Nomor telepon dalam format 628...
 */
const formatRawNumber = (num) => {
    if (num === null || num === undefined) return "";
    
    // 1. Konversi ke string dan hilangkan semua karakter non-digit.
    let digits = String(num).replace(/\D/g, ""); 
    
    if (digits.length === 0) return "";
    
    // 2. Ubah format 08... menjadi 628...
    if (digits.startsWith("0")) {
        digits = "62" + digits.slice(1);
    }
    
    // 3. Hanya mengembalikan digit nomor telepon.
    return digits; 
};

/**
 * Baca kontak dari file Excel.
 * 🛑 Fix: Mengasumsikan header adalah 'Nama' dan 'HP' (Case-Sensitive di ExcelJS).
 * @param {string} filePath - path file Excel yang disediakan oleh Multer
 * @returns {Array<{nama: string, hp: string}>}
 */
export const readContacts = (filePath) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
    }

    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        // 🛑 PERHATIAN: Gunakan raw: false untuk memastikan tipe data teks dibaca.
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        
        if (data.length < 2) {
            throw new Error("File Excel kosong atau hanya berisi baris header.");
        }

        const headers = data[0];
        const dataRows = data.slice(1);

        // 🛑 PERBAIKAN KRITIS: Cari indeks kolom 'Nama' dan 'HP'
        // Kita gunakan pencarian case-insensitive di sini sebagai fallback yang aman
        const nameIndex = headers.findIndex(h => h && String(h).trim().toLowerCase() === 'nama');
        const hpIndex = headers.findIndex(h => h && String(h).trim().toLowerCase() === 'hp');

        if (nameIndex === -1 || hpIndex === -1) {
            const validHeaders = headers.map(h => String(h)).join(', ');
            throw new Error(`Header kolom tidak ditemukan. Diperlukan 'Nama' dan 'HP'. Ditemukan: ${validHeaders}`);
        }
        
        console.log(`✅ Header terdeteksi: Nama Index=${nameIndex}, HP Index=${hpIndex}`);


        const contacts = dataRows.map((row) => {
            const rawName = row[nameIndex];
            const rawNumber = row[hpIndex];

            return {
                nama: String(rawName || "Teman").trim(),
                // 🛑 Key diganti menjadi 'hp'
                hp: formatRawNumber(rawNumber), 
            };
        }).filter(contact => contact.hp.length >= 8); // Filter kontak dengan nomor minimal 8 digit

        if (contacts.length === 0) {
             throw new Error("File Excel dibaca, tetapi tidak ada kontak yang valid (nomor telepon minimal 8 digit).");
        }
        
        console.log(`✅ ${contacts.length} kontak berhasil dibaca dan diproses.`);

        return contacts;

    } catch (error) {
        // Catat error aslinya untuk debugging
        console.error("❌ ERROR saat membaca file Excel:", error.message);
        throw new Error(`Gagal memproses file Excel: ${error.message}`);
    }
};

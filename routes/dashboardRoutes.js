import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

// =======================================================
// 1. ENDPOINT KHUSUS SUPERUSER (DI AWAL TANPA MIDDLEWARE)
// =======================================================
router.get('/admin/summary/messages', dashboardController.getAdminMessageSummary);
router.get('/admin/summary/inbox', dashboardController.getAdminInboxSummary);
router.get('/admin/summary/devices', dashboardController.getAdminDeviceSummary);
router.get('/admin/recent/outgoing', dashboardController.getAdminRecentOutgoing);
router.get('/admin/recent/incoming', dashboardController.getAdminRecentIncoming);
router.get('/admin/schedules/details', dashboardController.getAdminScheduleDetails);

// =======================================================
// 2. MIDDLEWARE YANG MENAMBAH USER ID (JIKA ADA)
//    Route di atas tidak akan terpengaruh olehnya.
// =======================================================
// Contoh: Jika Anda punya middleware autentikasi:
// router.use(authMiddleware.attachUserToRequest); 


// =======================================================
// 3. ENDPOINT UMUM (DENGAN MIDDLEWARE/FILTER)
// =======================================================
router.get('/summary/messages', dashboardController.getMessageSummary);
router.get('/summary/inbox', dashboardController.getInboxSummary);
router.get('/summary/devices', dashboardController.getDeviceSummary);
router.get('/recent/outgoing', dashboardController.getRecentOutgoing);
router.get('/recent/incoming', dashboardController.getRecentIncoming);
router.get('/schedules/details', dashboardController.getScheduleDetails);

export default router;

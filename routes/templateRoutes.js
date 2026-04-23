// routes/templateRoutes.js (FILE BARU)

import express from "express";
const router = express.Router();

import * as templateController from "../controllers/templateController.js";

// GET ALL
router.get("/", templateController.getTemplates); 

// POST CREATE
router.post("/", templateController.createTemplate); 

// PUT UPDATE
router.put("/:id", templateController.updateTemplate); 

// DELETE
router.delete("/:id", templateController.deleteTemplate); 

export default router;

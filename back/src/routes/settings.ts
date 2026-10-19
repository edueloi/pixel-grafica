// Configurações do sistema: todos leem (as telas usam os padrões), só o administrador altera.
import { Router } from "express";
import { requireRole } from "../auth.js";
import { ah } from "./util.js";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "../lib/settings.js";

export const router = Router();

router.get("/settings", ah(async (_req, res) => { res.json(await getSettings()); }));
router.put("/settings", requireRole(), ah(async (req, res) => { res.json(await saveSettings(req.body)); }));
router.post("/settings/reset", requireRole(), ah(async (_req, res) => { res.json(await saveSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))); }));

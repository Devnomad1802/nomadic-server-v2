import { Router } from "express";
import { catchAsync, authRole } from "../middlewares/index.js";
import { saveDraft, listDrafts, getDraft, deleteDraft } from "../controllers/formDrafts.js";

const formDraftRoutes = Router();
const adminOnly = authRole("Admin");

// Admin-only, owner-scoped saved form drafts.
formDraftRoutes.post("/", ...adminOnly, catchAsync(saveDraft));
formDraftRoutes.get("/", ...adminOnly, catchAsync(listDrafts));
formDraftRoutes.get("/:id", ...adminOnly, catchAsync(getDraft));
formDraftRoutes.delete("/:id", ...adminOnly, catchAsync(deleteDraft));

export default formDraftRoutes;

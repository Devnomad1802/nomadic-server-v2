// seo routes
import express from "express";
import { catchAsync } from "../middlewares/index.js";
import { addSeo, updateSeo, getSeo, getAllSeo } from "../controllers/Seo.js";

const SeoRoutes = express.Router();

SeoRoutes.post("/add-seo", catchAsync(addSeo));
// Update SEO - supports multiple ways to provide ID
// PUT /update-seo (with _id in body)
// PUT /update-seo/:id (with id in URL)
// PUT /update-seo?_id=123 (with _id in query)
// If no ID provided, updates the latest SEO entry
SeoRoutes.put("/update-seo/:_id", catchAsync(updateSeo));
SeoRoutes.put("/update-seo", catchAsync(updateSeo));
SeoRoutes.get("/get-seo", catchAsync(getSeo));
SeoRoutes.get("/get-all-seo", catchAsync(getAllSeo));

export default SeoRoutes;
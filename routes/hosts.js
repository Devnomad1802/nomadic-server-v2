import { Router } from "express";
import {
  createHost,
  getAllHosts,
  getHostById,
  updateHost,
  updateHostPartial,
  deleteHost,
  updateHostStatus,
  toggleHostStatus,
  getHostsBySpecialty,
  getHostsByLocation,
  getHostStats,
  addGalleryImages,
  removeGalleryImages,
  updateBrandingImages,
  deleteHostGalleryImage,
  uploadHostGalleryImage,
  getTripsByHost,
} from "../controllers/hosts.js";
import { catchAsync } from "../middlewares/index.js";

const hostRoutes = Router();

// IMPORTANT: Route order matters! Most specific routes must come before parameterized routes
// This prevents conflicts like "/specialty" being interpreted as an ":id" parameter

// Statistics (most specific routes first)
hostRoutes.get("/stats/overview", catchAsync(getHostStats));

// Specialized queries (specific routes before parameterized ones)
// These must come before /:id routes to prevent conflicts
hostRoutes.get("/specialty/:specialty", catchAsync(getHostsBySpecialty));
hostRoutes.get("/location/:location", catchAsync(getHostsByLocation));

// Status management (specific routes before parameterized ones)
// These must come before /:id routes to prevent conflicts
hostRoutes.patch("/:id/status", catchAsync(updateHostStatus));
hostRoutes.patch("/:id/toggle-status", catchAsync(toggleHostStatus));

// Gallery management (specific routes before parameterized ones)
// These must come before /:id routes to prevent conflicts
hostRoutes.post("/:id/gallery", catchAsync(addGalleryImages));
hostRoutes.delete("/:id/gallery", catchAsync(removeGalleryImages));

// Single gallery image management (specific routes before parameterized ones)
// These must come before /:id routes to prevent conflicts
hostRoutes.delete("/deleteGalleryImage", catchAsync(deleteHostGalleryImage));
hostRoutes.post("/uploadGalleryImage", catchAsync(uploadHostGalleryImage));

// Branding images management (specific routes before parameterized ones)
// These must come before /:id routes to prevent conflicts
hostRoutes.put("/:id/branding", catchAsync(updateBrandingImages));

// Get trips by host (specific routes before parameterized ones)
// This must come before /:id routes to prevent conflicts
hostRoutes.get("/:id/trips", catchAsync(getTripsByHost));

// Basic CRUD operations (parameterized routes last)
// These come last because they use /:id parameters which could match any string
hostRoutes.post("/", catchAsync(createHost));
hostRoutes.get("/", catchAsync(getAllHosts));
hostRoutes.get("/:id", catchAsync(getHostById));
hostRoutes.put("/:id", catchAsync(updateHost));
hostRoutes.patch("/:id", catchAsync(updateHostPartial)); // New partial update endpoint
hostRoutes.delete("/:id", catchAsync(deleteHost));

export default hostRoutes;

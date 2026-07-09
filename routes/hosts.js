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
  updateHostFlags
} from "../controllers/hosts.js";
import { catchAsync, authRole } from "../middlewares/index.js";

const hostRoutes = Router();
const adminOnly = authRole("Admin");

// IMPORTANT: Route order matters! Most specific routes must come before parameterized routes
// This prevents conflicts like "/specialty" being interpreted as an ":id" parameter

// Statistics (most specific routes first)
hostRoutes.get("/stats/overview", catchAsync(getHostStats));

// Specialized queries (specific routes before parameterized ones)
// These must come before /:id routes to prevent conflicts
hostRoutes.get("/specialty/:specialty", catchAsync(getHostsBySpecialty));
hostRoutes.get("/location/:location", catchAsync(getHostsByLocation));

// Status + management writes are Admin-only.
hostRoutes.patch("/:id/status", ...adminOnly, catchAsync(updateHostStatus));
hostRoutes.patch("/:id/toggle-status", ...adminOnly, catchAsync(toggleHostStatus));
hostRoutes.patch("/:id/flags", ...adminOnly, catchAsync(updateHostFlags));

// Gallery management (Admin-only)
hostRoutes.post("/:id/gallery", ...adminOnly, catchAsync(addGalleryImages));
hostRoutes.delete("/:id/gallery", ...adminOnly, catchAsync(removeGalleryImages));

// Single gallery image management (Admin-only)
hostRoutes.delete("/deleteGalleryImage", ...adminOnly, catchAsync(deleteHostGalleryImage));
hostRoutes.post("/uploadGalleryImage", ...adminOnly, catchAsync(uploadHostGalleryImage));

// Branding images management (Admin-only)
hostRoutes.put("/:id/branding", ...adminOnly, catchAsync(updateBrandingImages));

// Get trips by host — public read (used by the dashboard fallback)
hostRoutes.get("/:id/trips", catchAsync(getTripsByHost));

// Basic CRUD (parameterized routes last). Reads stay public (Meet Our Hosts
// directory); getAllHosts trims sensitive fields for non-admins in the
// controller. Writes are Admin-only.
hostRoutes.post("/", ...adminOnly, catchAsync(createHost));
hostRoutes.get("/", catchAsync(getAllHosts));
hostRoutes.get("/:id", catchAsync(getHostById));
hostRoutes.put("/:id", ...adminOnly, catchAsync(updateHost));
hostRoutes.patch("/:id", ...adminOnly, catchAsync(updateHostPartial));
hostRoutes.delete("/:id", ...adminOnly, catchAsync(deleteHost));

export default hostRoutes;

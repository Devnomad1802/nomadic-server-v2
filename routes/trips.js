import { Router } from "express";
import { catchAsync, authRole } from "../middlewares/index.js";
import { AddTrip, updateTrip, updateTripStatus } from "../controllers/trips.js";
import { GetAllTrips } from "../controllers/trips.js";
import { GetTripsById } from "../controllers/trips.js";
import {
  GetTripsByCagtegory,
  GetAllTripsForUser,
  GetTrendingTrips,
  GetAllTripsWithFilter,
  deleteTrips,
  deleteTripGalleryImage,
  uploadTripGalleryImage,
} from "../controllers/trips.js";

export const TipsRouts = Router();

// Writes are guarded. addTrip: Admin (full) or Host (own proposal, forced
// pending server-side). Status/update/delete: Admin only.
TipsRouts.post("/addTrip", ...authRole("Admin", "Host"), catchAsync(AddTrip));
TipsRouts.post("/updateTrip", ...authRole("Admin"), catchAsync(updateTrip));
TipsRouts.post("/updateTripStatus", ...authRole("Admin"), catchAsync(updateTripStatus));

// Public reads (unchanged)
TipsRouts.get("/GetAllTrips", catchAsync(GetAllTrips));
TipsRouts.get("/GetTrendingTrips", catchAsync(GetTrendingTrips));
TipsRouts.get("/GetAllTripsForUser", catchAsync(GetAllTripsForUser));
TipsRouts.post("/GetTripsById", catchAsync(GetTripsById));
TipsRouts.post("/GetTripsByCagtegory", catchAsync(GetTripsByCagtegory));
TipsRouts.post("/GetAllTripsWithFilter", catchAsync(GetAllTripsWithFilter));

TipsRouts.post("/deleteTrips", ...authRole("Admin"), catchAsync(deleteTrips));

// Single gallery image management (Admin or Host)
TipsRouts.delete("/deleteGalleryImage", ...authRole("Admin", "Host"), catchAsync(deleteTripGalleryImage));
TipsRouts.post("/uploadGalleryImage", ...authRole("Admin", "Host"), catchAsync(uploadTripGalleryImage));

export default TipsRouts;

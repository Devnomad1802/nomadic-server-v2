import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { AddTrip, updateTrip } from "../controllers/trips.js";
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

TipsRouts.post("/addTrip", catchAsync(AddTrip));
TipsRouts.post("/updateTrip", catchAsync(updateTrip));
TipsRouts.get("/GetAllTrips", catchAsync(GetAllTrips));
TipsRouts.get("/GetTrendingTrips", catchAsync(GetTrendingTrips));
TipsRouts.get("/GetAllTripsForUser", catchAsync(GetAllTripsForUser));
TipsRouts.post("/GetTripsById", catchAsync(GetTripsById));
TipsRouts.post("/GetTripsByCagtegory", catchAsync(GetTripsByCagtegory));
TipsRouts.post("/GetAllTripsWithFilter", catchAsync(GetAllTripsWithFilter));
TipsRouts.post("/deleteTrips", catchAsync(deleteTrips));

// Single gallery image management
TipsRouts.delete("/deleteGalleryImage", catchAsync(deleteTripGalleryImage));
TipsRouts.post("/uploadGalleryImage", catchAsync(uploadTripGalleryImage));

export default TipsRouts;

import { Router } from "express";
import passport from "passport";
import {
  addVendor,
  GetAllVendors,
  updateVendor,
  deleteVendor,
} from "../controllers/vendors.js";
import { catchAsync } from "../middlewares/index.js";

export const vendorRoutes = Router();

vendorRoutes.post("/addVendor", catchAsync(addVendor));
vendorRoutes.get("/GetAllVendors", catchAsync(GetAllVendors));
vendorRoutes.post("/updateVendor", catchAsync(updateVendor));
vendorRoutes.post("/deleteVendor", catchAsync(deleteVendor));

export default vendorRoutes;

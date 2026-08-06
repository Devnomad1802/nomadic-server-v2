import { Router } from "express";
import passport from "passport";
import { catchAsync } from "../middlewares/index.js";
import { listAddons, seedAddons } from "../controllers/addons.js";

export const AddonRoutes = Router();
const auth = passport.authenticate("jwt", { session: false });

// Public: the add-on catalogue for a trip (scoped, active). Prices are display
// only — the server re-prices from the DB when the order is created.
AddonRoutes.get("/", catchAsync(listAddons));
// Admin: idempotent seed of the first Travel Insurance add-on.
AddonRoutes.post("/seed", auth, catchAsync(seedAddons));

export default AddonRoutes;

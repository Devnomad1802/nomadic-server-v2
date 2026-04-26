import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import { order, validate } from "../controllers/Order.js";
export const OrderRoute = Router();
import passport from "passport";

OrderRoute.post("/order", catchAsync(order));
OrderRoute.post("/validate", catchAsync(validate));

export default OrderRoute;

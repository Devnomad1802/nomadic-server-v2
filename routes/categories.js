import { Router } from "express";
import { catchAsync, isAdmin } from "../middlewares/index.js";
import {
  addCategories,
  getAllCategories,
  deleteCategories,
  updateCategory,
} from "../controllers/categories.js";
import passport from "passport";

export const CategoriesRouts = Router();
CategoriesRouts.post(
  "/addCategories",
  isAdmin,
  catchAsync(addCategories)
);
CategoriesRouts.delete(
  "/deleteCategories",
  isAdmin,
  catchAsync(deleteCategories)
);
CategoriesRouts.get(
  "/getAllCategories",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllCategories)
);

CategoriesRouts.put(
  "/updateCategory",
  isAdmin,
  catchAsync(updateCategory)
);

export default CategoriesRouts;

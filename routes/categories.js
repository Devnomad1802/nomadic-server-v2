import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
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
  // passport.authenticate("jwt", { session: false }),
  catchAsync(addCategories)
);
CategoriesRouts.delete(
  "/deleteCategories",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(deleteCategories)
);
CategoriesRouts.get(
  "/getAllCategories",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllCategories)
);

CategoriesRouts.put(
  "/updateCategory",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(updateCategory)
);

export default CategoriesRouts;

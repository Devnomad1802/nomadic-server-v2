import { Router } from "express";
import { catchAsync, isAdmin } from "../middlewares/index.js";
import {
  blogtest,
  addBlog,
  getAllBlogs,
  deleteBlog,
  updateBlog,
  deleteBlogImage,
  uploadBlogImage,
} from "../controllers/blogs.js";
import passport from "passport";

export const BlogRouts = Router();
BlogRouts.get(
  "/blogtest",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(blogtest)
);
BlogRouts.post(
  "/addBlog",
  isAdmin,
  catchAsync(addBlog)
);
BlogRouts.delete(
  "/deleteBlog",
  isAdmin,
  catchAsync(deleteBlog)
);
BlogRouts.get(
  "/getAllBlogs",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllBlogs)
);
BlogRouts.post(
  "/updateBlog",
  isAdmin,
  catchAsync(updateBlog)
);
BlogRouts.delete(
  "/deleteBlogImage",
  isAdmin,
  catchAsync(deleteBlogImage)
);
BlogRouts.post(
  "/uploadBlogImage",
  isAdmin,
  catchAsync(uploadBlogImage)
);
export default BlogRouts;

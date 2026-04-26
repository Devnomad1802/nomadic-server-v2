import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
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
  // passport.authenticate("jwt", { session: false }),
  catchAsync(addBlog)
);
BlogRouts.delete(
  "/deleteBlog",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(deleteBlog)
);
BlogRouts.get(
  "/getAllBlogs",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(getAllBlogs)
);
BlogRouts.post(
  "/updateBlog",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(updateBlog)
);
BlogRouts.delete(
  "/deleteBlogImage",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(deleteBlogImage)
);
BlogRouts.post(
  "/uploadBlogImage",
  // passport.authenticate("jwt", { session: false }),
  catchAsync(uploadBlogImage)
);
export default BlogRouts;

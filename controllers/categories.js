import { Categories, Trips } from "../models/index.js";
import { uploadFilesToS3, deleteMultipleFromS3 } from "../middlewares/index.js";

const ciEq = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

// A trip's `categories` entries may be plain names ("INDIA") OR a JSON-
// stringified array ('["INDIA","GROUP TOUR"]'), because the admin trip form
// submits JSON.stringify(categories). Rewrite every occurrence of `oldName`
// to `newName` in-place while preserving whichever shape was stored.
// Returns the new array, or null when nothing changed.
export const renameInTripCategories = (categories, oldName, newName) => {
  if (!Array.isArray(categories)) return null;
  let changed = false;
  const next = categories.map((raw) => {
    if (typeof raw !== "string") return raw;
    const str = raw.trim();
    if (/^\[.*\]$/.test(str)) {
      try {
        const arr = JSON.parse(str);
        if (Array.isArray(arr)) {
          let innerChanged = false;
          const mapped = arr.map((x) => {
            if (ciEq(x, oldName)) { innerChanged = true; return newName; }
            return x;
          });
          if (innerChanged) { changed = true; return JSON.stringify(mapped); }
          return raw;
        }
      } catch { /* not valid JSON — treat as a plain name below */ }
    }
    if (ciEq(str, oldName)) { changed = true; return newName; }
    return raw;
  });
  return changed ? next : null;
};

// Helper to clean up any files uploaded during the current request
const cleanupUploadedFiles = async (req) => {
  if (!req.uploadedFiles) return;
  const filesToDelete = [];
  Object.values(req.uploadedFiles)
    .flat()
    .forEach((file) => file?.key && filesToDelete.push(file.key));

  if (filesToDelete.length > 0) {
    try {
      await deleteMultipleFromS3(filesToDelete);
    } catch (err) {
      console.error("Error cleaning up uploaded files:", err?.message || err);
    }
  }
};

export const addCategories = async (req, res) => {
  const fields = [
    { name: "Banner_Image", maxCount: 1 },
    { name: "Page_Banner_Image", maxCount: 1 },
  ];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }
    const { Starting_From } = req.body;
    // Normalise the display name on the way in so trailing/duplicate spaces
    // never create a mismatch with trip category tags.
    const Category =
      typeof req.body.Category === "string"
        ? req.body.Category.trim().replace(/\s+/g, " ")
        : req.body.Category;
    try {
      // Process uploaded files from S3
      let Banner_Image = null;
      let Page_Banner_Image = null;

      if (req?.uploadedFiles?.Banner_Image && req?.uploadedFiles?.Banner_Image[0]) {
        Banner_Image = req.uploadedFiles.Banner_Image[0].url;
      }
      if (req?.uploadedFiles?.Page_Banner_Image && req?.uploadedFiles?.Page_Banner_Image[0]) {
        Page_Banner_Image = req.uploadedFiles.Page_Banner_Image[0].url;
      }
      const addReview = new Categories({
        Category,
        Starting_From,
        Banner_Image,
        Page_Banner_Image,
        Date: new Date(new Date().toUTCString()),
      });

      await addReview.save();

      return res
        .status(200)
        .json({ message: "Category added successfully", data: addReview });
    } catch (error) {
      console.error("Error adding category:", error);
      
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      
      return res.status(500).json({ error: "Internal server error" });
    }
  });
};
export const getAllCategories = async (req, res) => {
  try {
    const getCategoret = await Categories.find().sort({ Date: -1 });
    return res.status(200).json({
      message: "All Categories retrieved successfully",
      data: getCategoret,
    });
  } catch (error) {
    console.error("Error retrieving Categories:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const updateCategory = async (req, res) => {
  const fields = [
    { name: "Banner_Image", maxCount: 1 },
    { name: "Page_Banner_Image", maxCount: 1 },
  ];

  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    try {
      const { _id, Category, Starting_From } = req.body;
      
      // Check if category exists
      const existingCategory = await Categories.findById(_id);
      if (!existingCategory) {
        // Clean up any uploaded files if category is not found
        await cleanupUploadedFiles(req);
        return res.status(404).json({ error: "Category not found" });
      }

      const updates = {};

      // Normalise the incoming name and detect a rename so we can keep every
      // trip's category tag in sync (the trip<->category link is the string
      // name, so a rename without this cascade would orphan tagged trips).
      const oldName = existingCategory.Category;
      const newName =
        typeof Category === "string"
          ? Category.trim().replace(/\s+/g, " ")
          : undefined;

      // Update fields if provided
      if (newName) updates.Category = newName;
      if (Starting_From) updates.Starting_From = Starting_From;
      
      // Handle Banner_Image update if new file is uploaded
      if (req?.uploadedFiles?.Banner_Image && req.uploadedFiles.Banner_Image[0]) {
        // Add old banner to deletion list
        const filesToDelete = [];
        if (existingCategory.Banner_Image) {
          filesToDelete.push(existingCategory.Banner_Image);
        }
        updates.Banner_Image = req.uploadedFiles.Banner_Image[0].url;

        // Delete old files after successful update
        if (filesToDelete.length > 0) {
          await deleteMultipleFromS3(filesToDelete);
        }
      }

      // Handle Page_Banner_Image update if new file is uploaded
      if (req?.uploadedFiles?.Page_Banner_Image && req.uploadedFiles.Page_Banner_Image[0]) {
        const filesToDelete = [];
        if (existingCategory.Page_Banner_Image) {
          filesToDelete.push(existingCategory.Page_Banner_Image);
        }
        updates.Page_Banner_Image = req.uploadedFiles.Page_Banner_Image[0].url;
        if (filesToDelete.length > 0) {
          await deleteMultipleFromS3(filesToDelete);
        }
      }

      const updatedCategory = await Categories.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      // Cascade a rename to every trip tagged with the old name so the
      // category page keeps resolving its trips (no orphaning / no drift).
      // Trip tags are stored as JSON-stringified blobs, so match loosely by
      // substring then rewrite each matched doc precisely (case-insensitive).
      let tripsUpdated = 0;
      if (newName && oldName && !ciEq(newName, oldName)) {
        const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const candidates = await Trips.find({
          categories: { $elemMatch: { $regex: esc, $options: "i" } },
        }).select("categories");
        for (const trip of candidates) {
          const next = renameInTripCategories(trip.categories, oldName, newName);
          if (next) {
            trip.categories = next;
            await trip.save();
            tripsUpdated += 1;
          }
        }
      }

      return res.status(200).json({
        message: "Category updated successfully",
        data: updatedCategory,
        tripsUpdated,
      });
    } catch (error) {
      console.error("Error updating category:", error);
      
      // Clean up uploaded files if there's an error
        await cleanupUploadedFiles(req);
      
      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

export const deleteCategories = async (req, res) => {
  try {
    console.log("id ....", req.body);
    
    // First find the category to get the file URLs
    const category = await Categories.findById(req.body._id);
    
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Collect all file URLs for deletion
    const filesToDelete = [];
    
    // Add banner image to deletion list if it exists
    if (category.Banner_Image) {
      filesToDelete.push(category.Banner_Image);
    }
    
    // Delete the category from database
    const dCategorey = await Categories.findByIdAndDelete({
      _id: req.body._id,
    });

    // Delete files from S3 after successful database deletion
    if (filesToDelete.length > 0) {
      await deleteMultipleFromS3(filesToDelete);
    }
    return res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

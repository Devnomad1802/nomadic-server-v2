import { Categories } from "../models/index.js";
import { uploadFilesToS3, deleteMultipleFromS3 } from "../middlewares/index.js";

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
  const fields = [{ name: "Banner_Image", maxCount: 1 }];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }
    const { Category, Starting_From } = req.body;
    try {
      // Process uploaded files from S3
      let Banner_Image = null;
      
      if (req?.uploadedFiles?.Banner_Image && req?.uploadedFiles?.Banner_Image[0]) {
        Banner_Image = req.uploadedFiles.Banner_Image[0].url;
      }
      const addReview = new Categories({
        Category,
        Starting_From,
        Banner_Image,
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
  const fields = [{ name: "Banner_Image", maxCount: 1 }];
  
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
      
      // Update fields if provided
      if (Category) updates.Category = Category;
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

      const updatedCategory = await Categories.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      return res.status(200).json({
        message: "Category updated successfully",
        data: updatedCategory
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

import { Reviews } from "../models/index.js";
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

export const addReview = async (req, res) => {
  const fields = [{ name: "Profile_Image", maxCount: 1 }];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    const { Title, Name, Review, rating, status, userId, Job } = req.body;

    try {
      // Process uploaded files from S3
      let Profile_Image = null;
      if (req?.uploadedFiles?.Profile_Image && req?.uploadedFiles?.Profile_Image[0]) {
        Profile_Image = req.uploadedFiles.Profile_Image[0].url;
      }
      const addReview = new Reviews({
        Title,
        Name,
        Review,
        Job,
        rating,
        status,
        Profile_Image,
        userId,
        Date: new Date(new Date().toUTCString()),
      });

      await addReview.save();

      return res
        .status(200)
        .json({ message: "Review added successfully", data: addReview });
    } catch (error) {
      console.error("Error adding review:", error);
      
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      
      return res.status(500).json({ error: "Internal server error" });
    }
  });
};
export const updateReview = async (req, res) => {
  const { _id, Title, Name, Review, rating, status, userId, Job } = req.body;

  try {
    if (!_id) {
      return res
        .status(400)
        .json({ error: "Review _id is required for updating" });
    }

    const existingReview = await Reviews.findOne({ _id: req.body._id });
    if (!existingReview) {
      return res.status(404).json({ error: "Review not found" });
    }

    existingReview.Title = Title;
    existingReview.Name = Name;
    existingReview.Review = Review;
    existingReview.rating = rating;
    existingReview.status = status;
    existingReview.userId = userId;
    existingReview.Job = Job;

    // Save the updated review
    await existingReview.save();

    return res
      .status(200)
      .json({ message: "Review updated successfully", data: existingReview });
  } catch (error) {
    console.error("Error updating review:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const getAllReviews = async (req, res) => {
  try {
    let query = {};
    const { range } = req.query;

    if (range === "7days") {
      query.Date = { $gte: moment().subtract(7, "days").toDate() };
    } else if (range === "30days") {
      query.Date = { $gte: moment().subtract(30, "days").toDate() };
    }
    const Review = await Reviews.find(query).sort({ Date: -1 });

    // Respond with the list of reviews
    return res
      .status(200)
      .json({ message: "All reviews retrieved successfully", data: Review });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving reviews:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const deleteReview = async (req, res) => {
  try {
    // First find the review to get the file URLs
    const review = await Reviews.findById(req.body._id);
    
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    // Collect file URL for deletion
    const filesToDelete = [];
    
    // Add profile image to deletion list if it exists
    if (review.Profile_Image) {
      filesToDelete.push(review.Profile_Image);
    }
    
    // Delete the review from database
    const dReview = await Reviews.findByIdAndDelete({ _id: req.body._id });

    // Delete files from S3 after successful database deletion
    if (filesToDelete.length > 0) {
      await deleteMultipleFromS3(filesToDelete);
    }
    
    return res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

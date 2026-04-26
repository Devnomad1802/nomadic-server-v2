import { CoverImages } from "../models/index.js";
import { deleteMultipleFromS3, uploadCoverImagesToS3 } from "../middlewares/index.js";

export const addCoverImage = async (req, res) => {
  // No need to specify fields since the new middleware handles any field names
  const fields = [];
  uploadCoverImagesToS3(fields)(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to upload files" });
    }

    try {
      // Process uploaded files from S3
      let home = [];
      let homeVideo = null;
      let allPakeges = null;
      let contactUS = null;
      let aboutUs = null;
      let blog = null;
      let footer = null;
      let aboutSection = null;

      // Handle multiple home images from separate fields (home[0], home[1], etc.)
      Object.keys(req.uploadedFiles || {}).forEach(fieldName => {
        if (fieldName.startsWith('home[') && fieldName.endsWith(']')) {
          if (req.uploadedFiles[fieldName] && req.uploadedFiles[fieldName][0]) {
            home.push(req.uploadedFiles[fieldName][0].url);
          }
        }
      });

      // Handle homeVideo
      if (req?.uploadedFiles?.homeVideo && req?.uploadedFiles?.homeVideo[0]) {
        homeVideo = req.uploadedFiles.homeVideo[0].url;
      }

      if (req?.uploadedFiles?.allPakeges && req?.uploadedFiles?.allPakeges[0]) {
        allPakeges = req.uploadedFiles.allPakeges[0].url;
      }
      if (req?.uploadedFiles?.contactUS && req?.uploadedFiles?.contactUS[0]) {
        contactUS = req.uploadedFiles.contactUS[0].url;
      }
      if (req?.uploadedFiles?.aboutUs && req?.uploadedFiles?.aboutUs[0]) {
        aboutUs = req.uploadedFiles.aboutUs[0].url;
      }
      if (req?.uploadedFiles?.blog && req?.uploadedFiles?.blog[0]) {
        blog = req.uploadedFiles.blog[0].url;
      }
      if (req?.uploadedFiles?.footer && req?.uploadedFiles?.footer[0]) {
        footer = req.uploadedFiles.footer[0].url;
      }
      if (req?.uploadedFiles?.aboutSection && req?.uploadedFiles?.aboutSection[0]) {
        aboutSection = req.uploadedFiles.aboutSection[0].url;
      }

      // Extract additional fields from request body
      const { homeLink, toggle, existingHomeUrls } = req.body;

      // Parse existingHomeUrls if it's a JSON string
      let existingUrls = [];
      if (existingHomeUrls) {
        try {
          existingUrls = JSON.parse(existingHomeUrls);
        } catch (e) {
          console.error("Error parsing existingHomeUrls:", e);
        }
      }

      let coverImage = await CoverImages.findOne();

      // Store previous images for cleanup
      let previousImagesToDelete = [];

      if (coverImage) {
        // Handle home images - merge existing URLs with new uploads
        if (existingUrls.length > 0 || home.length > 0) {
          // Combine existing URLs (that user wants to keep) with new uploads
          const mergedHomeImages = [...existingUrls, ...home];

          // Find old images that should be deleted (not in existingUrls or new uploads)
          if (coverImage.home && coverImage.home.length > 0) {
            coverImage.home.forEach(oldUrl => {
              // Only delete if it's not in the existing URLs the user wants to keep
              if (!existingUrls.includes(oldUrl)) {
                previousImagesToDelete.push(oldUrl);
              }
            });
          }

          coverImage.home = mergedHomeImages;
        }

        // Store previous single images for cleanup if new ones are uploaded
        if (homeVideo && homeVideo.trim() !== "" && coverImage.homeVideo) {
          previousImagesToDelete.push(coverImage.homeVideo);
        }
        if (allPakeges && allPakeges.trim() !== "" && coverImage.allPakeges) {
          previousImagesToDelete.push(coverImage.allPakeges);
        }
        if (contactUS && contactUS.trim() !== "" && coverImage.contactUS) {
          previousImagesToDelete.push(coverImage.contactUS);
        }
        if (aboutUs && aboutUs.trim() !== "" && coverImage.aboutUs) {
          previousImagesToDelete.push(coverImage.aboutUs);
        }
        if (blog && blog.trim() !== "" && coverImage.blog) {
          previousImagesToDelete.push(coverImage.blog);
        }
        if (footer && footer.trim() !== "" && coverImage.footer) {
          previousImagesToDelete.push(coverImage.footer);
        }
        if (aboutSection && aboutSection.trim() !== "" && coverImage.aboutSection) {
          previousImagesToDelete.push(coverImage.aboutSection);
        }

        // Update other fields
        if (homeVideo && homeVideo.trim() !== "") coverImage.homeVideo = homeVideo;
        if (allPakeges && allPakeges.trim() !== "")
          coverImage.allPakeges = allPakeges;
        if (contactUS && contactUS.trim() !== "")
          coverImage.contactUS = contactUS;
        if (aboutUs && aboutUs.trim() !== "") coverImage.aboutUs = aboutUs;
        if (blog && blog.trim() !== "") coverImage.blog = blog;
        if (footer && footer.trim() !== "") coverImage.footer = footer;
        if (aboutSection && aboutSection.trim() !== "")
          coverImage.aboutSection = aboutSection;
        if (homeLink !== undefined) coverImage.homeLink = homeLink;
        if (toggle !== undefined) coverImage.toggle = toggle;

        coverImage.Date = new Date();

        await coverImage.save();
      } else {
        // If document doesn't exist, create a new one
        // Merge existing URLs with new uploads for home field
        const mergedHomeImages = [...existingUrls, ...home];

        coverImage = new CoverImages({
          home: mergedHomeImages,
          homeVideo,
          allPakeges,
          contactUS,
          aboutUs,
          blog,
          footer,
          aboutSection,
          homeLink,
          toggle,
          Date: new Date(),
        });

        await coverImage.save();
      }

      // Clean up previous images from S3
      if (previousImagesToDelete.length > 0) {
        try {
          await deleteMultipleFromS3(previousImagesToDelete);
          console.log(`Cleaned up ${previousImagesToDelete.length} previous images from S3`);
        } catch (cleanupError) {
          console.error("Error cleaning up previous images:", cleanupError);
          // Don't fail the request if cleanup fails
        }
      }

      return res.status(200).json({
        message: "Cover image updated successfully",
        data: coverImage,
      });
    } catch (error) {
      console.error("Error updating cover image:", error);

      // Clean up uploaded files if there's an error
      if (req.uploadedFiles) {
        const filesToDelete = [];
        Object.values(req.uploadedFiles).flat().forEach(file => {
          filesToDelete.push(file.key);
        });
        try {
          await deleteMultipleFromS3(filesToDelete);
        } catch (cleanupError) {
          console.error("Error cleaning up uploaded files:", cleanupError);
        }
      }

      return res.status(500).json({ error: "Internal server error" });
    }
  });
};




export const getCoverImages = async (req, res) => {
  try {
    const Banner = await CoverImages.find();

    // Respond with the list of cover images
    return res
      .status(200)
      .json({ message: "All cover images retrieved successfully", data: Banner });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving cover images:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const deleteCoverImage = async (req, res) => {
  try {
    // First find the cover image to get the file URLs
    const coverImage = await CoverImages.findById(req.body._id);

    if (!coverImage) {
      return res.status(404).json({ error: "Cover image not found" });
    }

    // Collect all file URLs for deletion
    const filesToDelete = [];

    // Handle home array (multiple images)
    if (coverImage.home && Array.isArray(coverImage.home)) {
      filesToDelete.push(...coverImage.home);
    }

    // Add all other cover image fields to deletion list if they exist
    const imageFields = ['homeVideo', 'allPakeges', 'contactUS', 'aboutUs', 'blog', 'footer', 'aboutSection'];

    imageFields.forEach(field => {
      if (coverImage[field]) {
        filesToDelete.push(coverImage[field]);
      }
    });

    // Delete the cover image from database
    const dBanner = await CoverImages.findByIdAndDelete({ _id: req.body._id });

    // Delete files from S3 after successful database deletion
    if (filesToDelete.length > 0) {
      await deleteMultipleFromS3(filesToDelete);
    }

    return res.status(200).json({ message: "Cover image deleted successfully" });
  } catch (error) {
    console.error("Error deleting cover image:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

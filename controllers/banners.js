import { Banners } from "../models/index.js";
import { uploadFilesToS3, deleteMultipleFromS3, uploadBannerFilesToS3 } from "../middlewares/index.js";

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
//
// export const addBanner = async (req, res) => {
//   const fields = [
//     { name: "Card_Image", maxCount: 20 },
//     { name: "Banner_Image", maxCount: 1 },
//   ];
//   uploadFiles(fields)(req, res, async (err) => {
//     if (err) {
//       return res.status(500).json({ error: "Failed to upload files" });
//     }

//     const { BannerType } = req.body;

//     try {
//       let Card_Image;
//       if (req.files["Card_Image"]) {
//         Card_Image = req.files["Card_Image"].map(
//           (file) => "/uploads/" + file.filename
//         );
//       }
//       let Banner_Image;
//       if (req.files["Banner_Image"] && req.files["Banner_Image"].length > 0) {
//         Banner_Image = req.files["Banner_Image"][0]
//           ? "/uploads/" + req.files["Banner_Image"][0].filename
//           : null;
//       }

//       const addBanner = new Banners({
//         BannerType,
//         Banner_Image,
//         Card_Image,
//         Date: new Date(new Date().toUTCString()),
//       });

//       await addBanner.save();

//       return res
//         .status(200)
//         .json({ message: "Trip added successfully", data: addBanner });
//     } catch (error) {
//       console.error("Error adding trip:", error);
//       return res.status(500).json({ error: "Internal server error" });
//     }
//   });
// };
export const addBanner = async (req, res) => {
  // Use the new advanced banner middleware that supports your payload structure
  uploadBannerFilesToS3()(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    const { toggle } = req.body;

    try {
      // Initialize banner data structure
      const bannerData = {
        toggle: toggle === 'true' || toggle === true,
        Date: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Process uploaded files and organize by field name
      if (req.uploadedFiles) {
        // Handle home images (array)
        if (req.uploadedFiles.home && req.uploadedFiles.home.length > 0) {
          bannerData.home = req.uploadedFiles.home.map(file => ({
            url: file.url,
            key: file.key,
            originalName: file.originalName,
            size: file.size,
            mimetype: file.mimetype,
            uploadType: file.uploadType,
            parts: file.parts || 1
          }));
        }

        // Handle homeVideo (single file) - THIS IS THE KEY PART FOR YOUR QUESTION
        if (req.uploadedFiles.homeVideo && req.uploadedFiles.homeVideo.length > 0) {
          const videoFile = req.uploadedFiles.homeVideo[0];
          bannerData.homeVideo = {
            url: videoFile.url,
            key: videoFile.key,
            originalName: videoFile.originalName,
            size: videoFile.size,
            mimetype: videoFile.mimetype,
            uploadType: videoFile.uploadType,
            parts: videoFile.parts || 1
          };
        }

        // Handle single image fields
        const singleImageFields = ['allPakeges', 'blog', 'aboutUs', 'contactUs', 'footer', 'aboutSection'];
        
        singleImageFields.forEach(fieldName => {
          if (req.uploadedFiles[fieldName] && req.uploadedFiles[fieldName].length > 0) {
            const imageFile = req.uploadedFiles[fieldName][0];
            bannerData[fieldName] = {
              url: imageFile.url,
              key: imageFile.key,
              originalName: imageFile.originalName,
              size: imageFile.size,
              mimetype: imageFile.mimetype,
              uploadType: imageFile.uploadType,
              parts: imageFile.parts || 1
            };
          }
        });
      }

      // Create and save the banner
      const newBanner = new Banners(bannerData);
      await newBanner.save();

      return res.status(200).json({
        message: "Banner added successfully",
        data: newBanner,
        uploadSummary: {
          totalFiles: Object.keys(req.uploadedFiles || {}).length,
          multipartUploads: Object.values(req.uploadedFiles || {}).flat()
            .filter(file => file.uploadType === 'multipart').length,
          totalSize: Object.values(req.uploadedFiles || {}).flat()
            .reduce((sum, file) => sum + file.size, 0)
        }
      });

    } catch (error) {
      console.error("Error adding banner:", error);
      
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      
      return res.status(500).json({ 
        error: "Internal server error",
        details: error.message 
      });
    }
  });
};

export const getAllBanner = async (req, res) => {
  try {
    const Banner = await Banners.find().sort({ Date: -1 });

    // Respond with the list of banners
    return res
      .status(200)
      .json({ message: "All banners retrieved successfully", data: Banner });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving banners:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const deleteBanner = async (req, res) => {
  try {
    // First find the banner to get the file URLs
    const banner = await Banners.findById(req.body._id);
    
    if (!banner) {
      return res.status(404).json({ error: "Banner not found" });
    }

    // Collect all file URLs for deletion
    const filesToDelete = [];
    
    // Add banner image to deletion list if it exists
    if (banner.Banner_Image) {
      filesToDelete.push(banner.Banner_Image);
    }
    
    // Add all card images to deletion list if they exist
    if (banner.Card_Image && banner.Card_Image.length > 0) {
      banner.Card_Image.forEach(imageUrl => {
        if (imageUrl) {
          filesToDelete.push(imageUrl);
        }
      });
    }
    
    // Delete the banner from database
    const dBanner = await Banners.findByIdAndDelete({ _id: req.body._id });

    // Delete files from S3 after successful database deletion
    if (filesToDelete.length > 0) {
      await deleteMultipleFromS3(filesToDelete);
    }
    
    return res.status(200).json({ message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting banner:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// delete one specific card image from banner
export const deleteBannerCardImage = async (req, res) => {
  try {
    const { _id, imageUrl } = req.body;
    
    if (!_id) {
      return res.status(400).json({ error: "Banner ID is required" });
    }
    
    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    // Find the banner
    const banner = await Banners.findById(_id);
    
    if (!banner) {
      return res.status(404).json({ error: "Banner not found" });
    }

    // Get current card images
    const currentImages = banner.Card_Image || [];
    
    // Check if image exists
    if (!currentImages.includes(imageUrl)) {
      return res.status(404).json({ error: "Image not found in banner card images" });
    }
    
    // Filter out the image to be deleted
    const updatedImages = currentImages.filter(url => url !== imageUrl);
    
    // Update the banner with filtered images
    const updatedBanner = await Banners.findByIdAndUpdate(
      _id,
      { Card_Image: updatedImages },
      { new: true }
    );

    // Delete the specified image from S3
    await deleteMultipleFromS3([imageUrl]);
    
    return res.status(200).json({
      message: "Image deleted successfully",
      data: updatedBanner,
      deletedImage: imageUrl
    });
  } catch (error) {
    console.error("Error deleting banner image:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// upload one new card image to existing banner
export const uploadBannerCardImage = async (req, res) => {
  const fields = [
    { name: "Card_Image", maxCount: 1 },
  ];

  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload file" });
    }

    try {
      const { _id } = req.body;
      
      if (!_id) {
        await cleanupUploadedFiles(req);
        return res.status(400).json({ error: "Banner ID is required" });
      }

      // Find the banner
      const banner = await Banners.findById(_id);
      
      if (!banner) {
        await cleanupUploadedFiles(req);
        return res.status(404).json({ error: "Banner not found" });
      }

      const updates = {};
      
      // Process uploaded card image
      if (req?.uploadedFiles?.Card_Image && req?.uploadedFiles?.Card_Image?.length > 0) {
        const newImage = req.uploadedFiles.Card_Image[0].url;
        const existingImages = banner.Card_Image || [];
        updates.Card_Image = [...existingImages, newImage];
      }

      // Update the banner
      const updatedBanner = await Banners.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      return res.status(200).json({
        message: "Image uploaded successfully",
        data: updatedBanner
      });
    } catch (error) {
      console.error("Error uploading banner image:", error);
      
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      
      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

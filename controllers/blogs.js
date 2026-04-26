import { Blogs } from "../models/index.js";
import { uploadFilesToS3, deleteMultipleFromS3, uploadBlogFilesToS3 } from "../middlewares/index.js";

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
export const blogtest = async (req, res) => {
  try {
    return res.status(200).json({ message: "blog file" });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// add blog 
export const addBlog = async (req, res) => {
  // Use flexible upload middleware to handle dynamic field names like images[0], images[1]
  uploadBlogFilesToS3()(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    try {
      const { title, location, author, content1, content2, items, content, metaDescription, seoSlug, seoTitle } = req.body;

      // Process Banner_Image
      let Banner_Image = null;
      if (req?.uploadedFiles?.Banner_Image && req?.uploadedFiles?.Banner_Image[0]) {
        Banner_Image = req.uploadedFiles.Banner_Image[0].url;
      }

      // Process dynamic images[0], images[1], etc.
      const uploadedImages = [];
      if (req.uploadedFiles) {
        // Sort field names to maintain order (images[0], images[1], etc.)
        const imageFields = Object.keys(req.uploadedFiles)
          .filter(fieldName => fieldName.startsWith('images[') && fieldName.endsWith(']'))
          .sort((a, b) => {
            const indexA = parseInt(a.match(/\[(\d+)\]/)?.[1] || '0');
            const indexB = parseInt(b.match(/\[(\d+)\]/)?.[1] || '0');
            return indexA - indexB;
          });

        imageFields.forEach(fieldName => {
          if (req.uploadedFiles[fieldName] && req.uploadedFiles[fieldName][0]) {
            uploadedImages.push(req.uploadedFiles[fieldName][0].url);
          }
        });
      }

      // Process items array and map image indices to actual image URLs
      let processedItems = [];
      if (items) {
        // Parse items if it's a string (common in form-data)
        let itemsArray;
        if (typeof items === 'string') {
          try {
            itemsArray = JSON.parse(items);
          } catch (e) {
            console.error("Error parsing items JSON:", e);
            itemsArray = [];
          }
        } else if (Array.isArray(items)) {
          itemsArray = items;
        } else {
          itemsArray = [];
        }

        processedItems = itemsArray.map(item => {
          const processedItem = {
            order: item.order || 0,
            type: item.type || 'content',
          };

          if (item.type === 'image' && item.imageIndex !== undefined) {
            // Map imageIndex to actual uploaded image URL
            const imageIndex = parseInt(item.imageIndex);
            if (uploadedImages[imageIndex] !== undefined) {
              processedItem.imageUrl = uploadedImages[imageIndex];
              processedItem.imageIndex = imageIndex;
            } else {
              console.warn(`Image index ${imageIndex} not found in uploaded images`);
            }
          } else if (item.type === 'content' && item.content !== undefined) {
            processedItem.content = item.content;
          }

          return processedItem;
        });
      } else if (content) {
        // Fallback: if items not provided but content is, create items from content
        let contentArray;
        if (typeof content === 'string') {
          try {
            contentArray = JSON.parse(content);
          } catch (e) {
            console.error("Error parsing content JSON:", e);
            contentArray = [];
          }
        } else if (Array.isArray(content)) {
          contentArray = content;
        } else {
          contentArray = [];
        }

        processedItems = contentArray.map(item => ({
          order: item.order || 0,
          type: 'content',
          content: item.content || '',
        }));
      }

      // Only set Add_Image if explicitly provided (for backward compatibility with old requests)
      let Add_Image = undefined;
      if (req?.uploadedFiles?.Add_Image && req?.uploadedFiles?.Add_Image?.length > 0) {
        Add_Image = req.uploadedFiles.Add_Image.map(file => file.url);
      }

      const addBlog = new Blogs({
        title,
        location,
        Banner_Image,
        ...(Add_Image && { Add_Image }), // Only include if provided
        images: uploadedImages, // New structured images array
        items: processedItems, // New structured items array
        author,
        content1, // Keep for backward compatibility
        content2, // Keep for backward compatibility
        metaDescription: metaDescription !== undefined ? metaDescription : "",
        seoSlug: seoSlug !== undefined ? seoSlug : "",
        seoTitle: seoTitle !== undefined ? seoTitle : "",
        Date: new Date(new Date().toUTCString()),
      });

      await addBlog.save();

      return res
        .status(200)
        .json({ message: "Blog added successfully", data: addBlog });
    } catch (error) {
      console.error("Error adding blog:", error);

      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);

      return res.status(500).json({
        error: "Internal server error",
        message: error.message
      });
    }
  });
};

// update blog 
export const updateBlog = async (req, res) => {
  // Use flexible upload middleware to handle dynamic field names
  uploadBlogFilesToS3()(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    const { _id } = req.body;

    if (!_id) {
      await cleanupUploadedFiles(req);
      return res.status(400).json({ error: "Blog ID is required" });
    }

    const existingBlog = await Blogs.findById(_id);
    if (!existingBlog) {
      // Clean up any uploaded files if blog is not found
      await cleanupUploadedFiles(req);
      return res.status(404).json({ error: "Blog not found" });
    }

    try {
      const updates = {};
      const updateData = req.body;
      const { title, location, author, content1, content2, items, content, metaDescription, seoSlug, seoTitle } = updateData;

      // Conditionally add fields if they exist in the request body
      if (title !== undefined) updates.title = title;
      if (location !== undefined) updates.location = location;
      if (author !== undefined) updates.author = author;
      if (content1 !== undefined) updates.content1 = content1;
      if (content2 !== undefined) updates.content2 = content2;
      if (metaDescription !== undefined) updates.metaDescription = metaDescription;
      if (seoSlug !== undefined) updates.seoSlug = seoSlug;
      if (seoTitle !== undefined) updates.seoTitle = seoTitle;

      // Process Banner_Image
      const oldFilesToDelete = [];
      if (req?.uploadedFiles?.Banner_Image && req?.uploadedFiles?.Banner_Image[0]) {
        // If there's an existing banner image, add it to cleanup list
        if (existingBlog.Banner_Image) {
          oldFilesToDelete.push(existingBlog.Banner_Image);
        }
        updates.Banner_Image = req.uploadedFiles.Banner_Image[0].url;
      }

      // Process dynamic images[0], images[1], etc.
      const uploadedImages = [];
      if (req.uploadedFiles) {
        // Sort field names to maintain order (images[0], images[1], etc.)
        const imageFields = Object.keys(req.uploadedFiles)
          .filter(fieldName => fieldName.startsWith('images[') && fieldName.endsWith(']'))
          .sort((a, b) => {
            const indexA = parseInt(a.match(/\[(\d+)\]/)?.[1] || '0');
            const indexB = parseInt(b.match(/\[(\d+)\]/)?.[1] || '0');
            return indexA - indexB;
          });

        imageFields.forEach(fieldName => {
          if (req.uploadedFiles[fieldName] && req.uploadedFiles[fieldName][0]) {
            uploadedImages.push(req.uploadedFiles[fieldName][0].url);
          }
        });
      }

      // Handle previous images if provided (for updates)
      let allImages = [];
      if (updateData.previous_images) {
        const previousImages = Array.isArray(updateData.previous_images)
          ? updateData.previous_images
          : JSON.parse(updateData.previous_images);
        // Put NEW uploads FIRST, then previous images
        // This ensures items array imageIndex 0, 1, etc. use new blogs folder images
        // New uploads go to blogs folder and will have proper permissions
        allImages = [...uploadedImages, ...previousImages];
      } else if (uploadedImages.length > 0) {
        // If new images are uploaded, put them FIRST, then append existing
        // This ensures new blogs folder images get lower indices (0, 1, 2...)
        // and will be used by items array instead of old cover-images URLs
        const existingImages = existingBlog.images || existingBlog.Add_Image || [];
        allImages = [...uploadedImages, ...existingImages];
      } else if (updateData.images !== undefined) {
        // If images array is explicitly provided in body, use it directly
        allImages = Array.isArray(updateData.images)
          ? updateData.images
          : JSON.parse(updateData.images);
      } else {
        // No new images and no explicit images array, keep existing images
        allImages = existingBlog.images || existingBlog.Add_Image || [];
      }

      // Check for deleted images
      const existingImages = existingBlog.images || existingBlog.Add_Image || [];
      const deletedImages = existingImages.filter(imageUrl => !allImages.includes(imageUrl));
      if (deletedImages.length > 0) {
        oldFilesToDelete.push(...deletedImages);
      }

      // Set images array
      if (allImages.length > 0 || updateData.images !== undefined) {
        updates.images = allImages;
        // Only update Add_Image if explicitly provided in request (for backward compatibility)
        if (updateData.Add_Image !== undefined || req?.uploadedFiles?.Add_Image) {
          updates.Add_Image = allImages;
        }
      }

      // Process items array and map image indices to actual image URLs
      if (items !== undefined || content !== undefined) {
        let processedItems = [];

        if (items) {
          // Parse items if it's a string (common in form-data)
          let itemsArray;
          if (typeof items === 'string') {
            try {
              itemsArray = JSON.parse(items);
            } catch (e) {
              console.error("Error parsing items JSON:", e);
              itemsArray = [];
            }
          } else if (Array.isArray(items)) {
            itemsArray = items;
          } else {
            itemsArray = [];
          }

          processedItems = itemsArray.map(item => {
            const processedItem = {
              order: item.order || 0,
              type: item.type || 'content',
            };

            if (item.type === 'image' && item.imageIndex !== undefined) {
              // Map imageIndex to actual image URL from allImages array
              const imageIndex = parseInt(item.imageIndex);
              if (allImages[imageIndex] !== undefined) {
                processedItem.imageUrl = allImages[imageIndex];
                processedItem.imageIndex = imageIndex;
              } else if (uploadedImages[imageIndex] !== undefined) {
                // Fallback to uploaded images if not in allImages yet
                processedItem.imageUrl = uploadedImages[imageIndex];
                processedItem.imageIndex = imageIndex;
              } else {
                console.warn(`Image index ${imageIndex} not found in uploaded images`);
              }
            } else if (item.type === 'content' && item.content !== undefined) {
              processedItem.content = item.content;
            }

            return processedItem;
          });
        } else if (content) {
          // Fallback: if items not provided but content is, create items from content
          let contentArray;
          if (typeof content === 'string') {
            try {
              contentArray = JSON.parse(content);
            } catch (e) {
              console.error("Error parsing content JSON:", e);
              contentArray = [];
            }
          } else if (Array.isArray(content)) {
            contentArray = content;
          } else {
            contentArray = [];
          }

          processedItems = contentArray.map(item => ({
            order: item.order || 0,
            type: 'content',
            content: item.content || '',
          }));
        }

        updates.items = processedItems;
      }

      // Update the document by ID
      const updatedBlog = await Blogs.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      if (!updatedBlog) {
        return res.status(404).json({ error: "Blog not found" });
      }

      // Delete old files from S3 after successful update
      if (oldFilesToDelete.length > 0) {
        await deleteMultipleFromS3(oldFilesToDelete);
      }

      return res.status(200).json({
        message: "Blog updated successfully",
        data: updatedBlog,
      });
    } catch (error) {
      console.error("Error updating blog:", error);

      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);

      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

// get all blogs 
export const getAllBlogs = async (req, res) => {
  try {
    const blog = await Blogs.find().sort({ Date: -1 });

    // Respond with the list of blog
    return res
      .status(200)
      .json({ message: "All blog retrieved successfully", data: blog });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// delete blog 
export const deleteBlog = async (req, res) => {
  try {
    // First find the blog to get the file URLs
    const blog = await Blogs.findById(req.body._id);

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    // Collect all file URLs for deletion
    const filesToDelete = [];

    // Add banner image to deletion list if it exists
    if (blog.Banner_Image) {
      filesToDelete.push(blog.Banner_Image);
    }

    // Add all additional images to deletion list if they exist
    if (blog.Add_Image && blog.Add_Image.length > 0) {
      blog.Add_Image.forEach(imageUrl => {
        if (imageUrl) {
          filesToDelete.push(imageUrl);
        }
      });
    }

    // Delete the blog from database
    const dBlog = await Blogs.findByIdAndDelete({ _id: req.body._id });

    // Delete files from S3 after successful database deletion
    if (filesToDelete.length > 0) {
      await deleteMultipleFromS3(filesToDelete);
    }

    return res.status(200).json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// delete one specific image from blog
export const deleteBlogImage = async (req, res) => {
  try {
    const { _id, imageUrl } = req.body;

    if (!_id) {
      return res.status(400).json({ error: "Blog ID is required" });
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    // Find the blog
    const blog = await Blogs.findById(_id);

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    // Get current images
    const currentImages = blog.Add_Image || [];

    // Check if image exists
    if (!currentImages.includes(imageUrl)) {
      return res.status(404).json({ error: "Image not found in blog" });
    }

    // Filter out the image to be deleted
    const updatedImages = currentImages.filter(url => url !== imageUrl);

    // Update the blog with filtered images
    const updatedBlog = await Blogs.findByIdAndUpdate(
      _id,
      { Add_Image: updatedImages },
      { new: true }
    );

    // Delete the specified image from S3
    await deleteMultipleFromS3([imageUrl]);

    return res.status(200).json({
      message: "Image deleted successfully",
      data: updatedBlog,
      deletedImage: imageUrl
    });
  } catch (error) {
    console.error("Error deleting blog image:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// upload one new image to existing blog
export const uploadBlogImage = async (req, res) => {
  const fields = [
    { name: "Add_Image", maxCount: 1 },
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
        return res.status(400).json({ error: "Blog ID is required" });
      }

      // Find the blog
      const blog = await Blogs.findById(_id);

      if (!blog) {
        await cleanupUploadedFiles(req);
        return res.status(404).json({ error: "Blog not found" });
      }

      const updates = {};

      // Process uploaded additional image (only Add_Image)
      if (req?.uploadedFiles?.Add_Image && req?.uploadedFiles?.Add_Image?.length > 0) {
        const newImage = req.uploadedFiles.Add_Image[0].url;
        const existingImages = blog.Add_Image || [];
        updates.Add_Image = [...existingImages, newImage];
      }

      // Update the blog
      const updatedBlog = await Blogs.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      return res.status(200).json({
        message: "Image uploaded successfully",
        data: updatedBlog
      });
    } catch (error) {
      console.error("Error uploading blog image:", error);

      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);

      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

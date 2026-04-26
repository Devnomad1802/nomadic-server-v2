import { Trips, Categories, Host } from "../models/index.js";
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

// Helper to parse and normalize ratings/reviews arrays (prevent double stringification)
const parseArrayField = (field) => {
  if (!field && field !== 0) return [];

  // If it's already an array, return it directly
  if (Array.isArray(field)) {
    return field;
  }

  // If it's a string, try to parse it (might be JSON stringified multiple times)
  if (typeof field === 'string') {
    try {
      let parsed = field;
      let attempts = 0;
      const maxAttempts = 10; // Prevent infinite loop

      // Keep parsing until we get a non-string or reach max attempts
      while (typeof parsed === 'string' && attempts < maxAttempts) {
        try {
          const temp = JSON.parse(parsed);
          // If we get an array, return it immediately
          if (Array.isArray(temp)) {
            return temp;
          }
          parsed = temp;
        } catch (e) {
          // If parsing fails, try to extract array from string pattern like "[4,54,3,2]"
          const match = parsed.match(/^\[(.*?)\]$/);
          if (match) {
            const values = match[1]
              .split(',')
              .map(v => {
                const trimmed = v.trim().replace(/^["']|["']$/g, ''); // Remove quotes
                const num = Number(trimmed);
                return isNaN(num) ? trimmed : num;
              })
              .filter(v => v !== ''); // Remove empty values
            return values;
          }
          // If no match, return empty array
          return [];
        }
        attempts++;
      }

      // If we ended up with an array after parsing, return it
      if (Array.isArray(parsed)) {
        return parsed;
      }

      // If all else fails, return empty array
      return [];
    } catch (error) {
      console.error("Error parsing array field:", error);
      return [];
    }
  }

  // If it's a number or other type, wrap it in an array
  return [field];
};

export const AddTrip = async (req, res) => {
  // Use the uploadFiles middleware to handle file uploads

  const fields = [
    { name: "gallaryImages", maxCount: 20 },
    { name: "bannerImage", maxCount: 1 },
    { name: "itenarryImg", maxCount: 1 },
    { name: "cardImage", maxCount: 1 },
  ];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    const {
      endSelectDate,
      title,
      subTitle,
      days,
      location,
      pickUp,
      dropOff,
      trendingHeading,
      Trending,
      // bannerImage,
      // cardImage,
      categories,
      overview,
      // itenarryImg,
      type,
      price,
      strikePrice,
      commissionRate,
      host,
      nights,
      numberOfDays,
      numberOfSeats,
      selectDate,
      date,
      firstBookingPrice,
      Inclusion,
      Exclusion,
      ThingsToCarry,
      Cancellation,
      discount,
      // gallaryImages,
      reviews,
      ratings,
      vendors,
      enableBooking,
      addsection,
      addDays,
      enableEnquire,
      bookings,
      tripOff,
      metaDescription,
      seoSlug,
      seoTitle,
    } = req.body;

    try {
      if (!req.uploadedFiles || Object.keys(req.uploadedFiles).length === 0) {
        return res.status(400).json({ error: "No images uploaded" });
      }

      // Process uploaded files from S3
      let gallaryImages = [];
      let bannerImage = null;
      let itenarryImg = null;
      let cardImage = null;

      if (req.uploadedFiles.gallaryImages && req.uploadedFiles.gallaryImages.length > 0) {
        gallaryImages = req.uploadedFiles.gallaryImages.map(file => file.url);
      }

      if (req.uploadedFiles.bannerImage && req.uploadedFiles.bannerImage[0]) {
        bannerImage = req.uploadedFiles.bannerImage[0].url;
      }

      if (req.uploadedFiles.itenarryImg && req.uploadedFiles.itenarryImg[0]) {
        itenarryImg = req.uploadedFiles.itenarryImg[0].url;
      }

      if (req.uploadedFiles.cardImage && req.uploadedFiles.cardImage[0]) {
        cardImage = req.uploadedFiles.cardImage[0].url;
      }

      // Parse and normalize ratings and reviews to prevent double stringification
      const normalizedRatings = parseArrayField(ratings);
      const normalizedReviews = parseArrayField(reviews);

      const addTrip = new Trips({
        title,
        endSelectDate,
        subTitle,
        days,
        location,
        pickUp,
        dropOff,
        bannerImage,
        cardImage,
        categories,
        overview,
        itenarryImg,
        price,
        strikePrice,
        commissionRate,
        host,
        nights,
        type,
        numberOfDays,
        numberOfSeats,
        selectDate,
        firstBookingPrice,
        date,
        addsection,
        Inclusion,
        Exclusion,
        ThingsToCarry,
        Cancellation,
        discount,
        gallaryImages, // Use galleryImages instead of gallaryImages
        reviews: normalizedReviews,
        ratings: normalizedRatings,
        vendors,
        addDays,
        enableBooking,
        enableEnquire,
        bookings,
        trendingHeading,
        Trending,
        tripOff: tripOff !== undefined ? Number(tripOff) : 0,
        metaDescription: metaDescription !== undefined ? metaDescription : "",
        seoSlug: seoSlug !== undefined ? seoSlug : "",
        seoTitle: seoTitle !== undefined ? seoTitle : "",
      });

      await addTrip.save();

      // Populate all host details before returning
      await addTrip.populate('host');

      return res
        .status(200)
        .json({ message: "Trip added successfully", data: addTrip });
    } catch (error) {
      console.error("Error adding trip:", error);

      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);

      return res.status(500).json({ error: "Internal server error" });
    }
  });
};
// ------------------------- update trip -------------------------

export const updateTrip = async (req, res) => {
  const fields = [
    { name: "gallaryImages", maxCount: 20 },
    { name: "bannerImage", maxCount: 1 },
    { name: "itenarryImg", maxCount: 1 },
    { name: "cardImage", maxCount: 1 },
  ];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    const id = req.body._id;
    if (!id) {
      await cleanupUploadedFiles(req);
      return res.status(400).json({ error: "Trip ID is required" });
    }

    const existingTrip = await Trips.findById(id);
    if (!existingTrip) {
      // Clean up uploaded files if trip is missing
      await cleanupUploadedFiles(req);
      return res.status(404).json({ error: "Trip not found" });
    }

    const {
      _id,
      title,
      endSelectDate,
      subTitle,
      days,
      location,
      pickUp,
      dropOff,
      trendingHeading,
      Trending,
      // bannerImage,
      // cardImage,
      categories,
      overview,
      // itenarryImg,
      type,
      price,
      strikePrice,
      commissionRate,
      host,
      nights,
      numberOfDays,
      numberOfSeats,
      selectDate,
      date,
      firstBookingPrice,
      Inclusion,
      Exclusion,
      ThingsToCarry,
      Cancellation,
      discount,
      reviews,
      ratings,
      vendors,
      enableBooking,
      addsection,
      addDays,
      enableEnquire,
      bookings,
      tripOff,
      metaDescription,
      seoSlug,
      seoTitle,
    } = req.body;


    try {
      const updateData = {};

      if (title) updateData.title = title;
      if (endSelectDate) {
        // Handle endSelectDate - convert array to string if needed
        if (Array.isArray(endSelectDate)) {
          updateData.endSelectDate = JSON.stringify(endSelectDate);
        } else {
          updateData.endSelectDate = endSelectDate;
        }
      }
      if (subTitle) updateData.subTitle = subTitle;
      if (days) updateData.days = days;
      if (location) updateData.location = location;
      if (pickUp) updateData.pickUp = pickUp;
      if (dropOff) updateData.dropOff = dropOff;
      if (trendingHeading) updateData.trendingHeading = trendingHeading;
      if (Trending) updateData.Trending = Trending;
      if (strikePrice) updateData.strikePrice = strikePrice;
      if (commissionRate) updateData.commissionRate = commissionRate;
      if (host) updateData.host = host;

      // Handle gallaryImages - combine uploaded files and body data
      let newGalleryImages = [];
      if (req.uploadedFiles && req.uploadedFiles.gallaryImages && req.uploadedFiles.gallaryImages.length > 0) {
        const uploadedGalleryImages = req.uploadedFiles.gallaryImages.map(file => file.url);
        let bodyGalleryImages = [];
        if (req.body.previous_gallery_images) {
          if (Array.isArray(req.body.previous_gallery_images)) {
            bodyGalleryImages = req.body.previous_gallery_images;
          } else if (typeof req.body.previous_gallery_images === "string") {
            bodyGalleryImages = JSON.parse(req.body.previous_gallery_images);
          }
        }
        newGalleryImages = [...bodyGalleryImages, ...uploadedGalleryImages];
      } else if (req.body.previous_gallery_images) {
        if (Array.isArray(req.body.previous_gallery_images)) {
          newGalleryImages = req.body.previous_gallery_images;
        } else if (typeof req.body.previous_gallery_images === "string") {
          newGalleryImages = JSON.parse(req.body.previous_gallery_images);
        }
      }

      // Check for deleted gallaryImages - compare new gallaryImages with existing gallaryImages
      const existingGalleryImages = existingTrip.gallaryImages || [];
      const deletedGalleryImages = existingGalleryImages.filter(imageUrl => !newGalleryImages.includes(imageUrl));

      // Add deleted images to cleanup list
      const oldFilesToDelete = [];
      if (deletedGalleryImages.length > 0) {
        oldFilesToDelete.push(...deletedGalleryImages);
      }

      // Set the new gallaryImages array
      if (newGalleryImages.length > 0) {
        updateData.gallaryImages = newGalleryImages;
      }

      // Handle other uploaded files from S3
      if (
        req.uploadedFiles &&
        req.uploadedFiles.bannerImage &&
        req.uploadedFiles.bannerImage[0]
      ) {
        // If there's an existing banner image, add it to cleanup list
        if (existingTrip.bannerImage) {
          oldFilesToDelete.push(existingTrip.bannerImage);
        }
        updateData.bannerImage = req.uploadedFiles.bannerImage[0].url;
      }

      if (req.uploadedFiles && req.uploadedFiles.cardImage && req.uploadedFiles.cardImage[0]) {
        // If there's an existing card image, add it to cleanup list
        if (existingTrip.cardImage) {
          oldFilesToDelete.push(existingTrip.cardImage);
        }
        updateData.cardImage = req.uploadedFiles.cardImage[0].url;
      }

      if (
        req.uploadedFiles &&
        req.uploadedFiles.itenarryImg &&
        req.uploadedFiles.itenarryImg[0]
      ) {
        // If there's an existing itinerary image, add it to cleanup list
        if (existingTrip.itenarryImg) {
          oldFilesToDelete.push(existingTrip.itenarryImg);
        }
        updateData.itenarryImg = req.uploadedFiles.itenarryImg[0].url;
      }
      ///////////////////////////////////
      if (categories) updateData.categories = categories;
      if (overview) updateData.overview = overview;
      if (type) updateData.type = type;
      if (price) updateData.price = price;
      if (nights) updateData.nights = nights;
      if (numberOfDays) updateData.numberOfDays = numberOfDays;
      if (numberOfSeats) updateData.numberOfSeats = numberOfSeats;
      if (selectDate) updateData.selectDate = selectDate;
      if (date) updateData.date = date;
      if (firstBookingPrice) updateData.firstBookingPrice = firstBookingPrice;
      if (addsection) updateData.addsection = addsection;
      if (Inclusion) updateData.Inclusion = Inclusion;
      if (Exclusion) updateData.Exclusion = Exclusion;
      if (ThingsToCarry) updateData.ThingsToCarry = ThingsToCarry;
      if (Cancellation) updateData.Cancellation = Cancellation;
      if (discount) updateData.discount = discount;
      // Parse and normalize ratings and reviews to prevent double stringification
      if (reviews !== undefined) updateData.reviews = parseArrayField(reviews);
      if (ratings !== undefined) updateData.ratings = parseArrayField(ratings);
      if (vendors) updateData.vendors = vendors;
      if (addDays) updateData.addDays = addDays;
      if (enableBooking !== undefined) updateData.enableBooking = enableBooking;
      if (enableEnquire !== undefined) updateData.enableEnquire = enableEnquire;
      if (bookings) updateData.bookings = bookings;
      if (tripOff !== undefined) updateData.tripOff = Number(tripOff);
      // Always include SEO fields if they exist in the request body
      if (req.body.metaDescription !== undefined) {
        updateData.metaDescription = req.body.metaDescription ? String(req.body.metaDescription) : "";
      }
      if (req.body.seoSlug !== undefined) {
        updateData.seoSlug = req.body.seoSlug ? String(req.body.seoSlug) : "";
      }
      if (req.body.seoTitle !== undefined) {
        updateData.seoTitle = req.body.seoTitle ? String(req.body.seoTitle) : "";
      }

      console.log("Update Data before save:", JSON.stringify(updateData, null, 2));
      console.log("SEO Fields in updateData:", {
        hasMetaDescription: 'metaDescription' in updateData,
        hasSeoSlug: 'seoSlug' in updateData,
        hasSeoTitle: 'seoTitle' in updateData,
        metaDescription: updateData.metaDescription,
        seoSlug: updateData.seoSlug,
        seoTitle: updateData.seoTitle
      });

      const updatedTrip = await Trips.findByIdAndUpdate(
        req.body._id,
        { $set: updateData },
        {
          new: true,
          runValidators: true
        }
      ).populate('host');

      if (!updatedTrip) {
        // Clean up uploaded files if the update did not find a trip
        await cleanupUploadedFiles(req);
        return res.status(404).json({ error: "Trip not found" });
      }

      console.log("Updated Trip SEO Fields:", {
        metaDescription: updatedTrip.metaDescription,
        seoSlug: updatedTrip.seoSlug,
        seoTitle: updatedTrip.seoTitle
      });

      // Delete old files from S3 after successful update
      if (oldFilesToDelete.length > 0) {
        try {
          await deleteMultipleFromS3(oldFilesToDelete);
        } catch (s3Error) {
          console.error("Error deleting old files from S3:", s3Error.message);
          // Don't fail the entire operation if S3 deletion fails
          // The files will remain in S3 but the database update was successful
        }
      }

      return res
        .status(200)
        .json({ message: "Trip updated successfully", data: updatedTrip });
    } catch (error) {
      console.error("Error updating trip:", error);

      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);

      // Return more specific error message
      if (error.name === 'CastError') {
        return res.status(400).json({
          error: "Invalid data type",
          message: `Field '${error.path}' expects ${error.kind} but received ${typeof error.value}`,
          details: error.message
        });
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message
      });
    }
  });
};


// ------------------------- get all trips -------------------------

export const GetAllTrips = async (req, res) => {
  try {
    // Fetch all trips from the database with host details populated
    const trips = await Trips.find()
      .populate('host')
      .sort({ date: -1 });
    return res
      .status(200)
      .json({ message: "All trips retrieved successfully", data: trips });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const GetAllTripsForUser = async (req, res) => {
  try {
    // Fetch all trips from the database with host details populated
    const trips = await Trips.find({ enableBooking: true })
      .populate('host')
      .sort({ date: -1 });
    return res
      .status(200)
      .json({ message: "All trips retrieved successfully", data: trips });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const GetTrendingTrips = async (req, res) => {
  try {
    const trips = await Trips.find({ Trending: true })
      .populate('host')
      .sort({ date: -1 });
    return res
      .status(200)
      .json({ message: "Trending trips retrieved successfully", data: trips });
  } catch (error) {
    console.error("Error retrieving trending trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const GetTripsById = async (req, res) => {
  try {
    const trips = await Trips.find({ _id: req.body._id })
      .populate('host')
      .sort({ date: -1 });
    return res
      .status(200)
      .json({ message: "Trip retrieved successfully", data: trips });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
// ------------------------- get trips by category -------------------------

export const GetTripsByCagtegory = async (req, res) => {
  try {
    // Ensure req.body.categories is an array
    const categories = Array.isArray(req.body.categories)
      ? req.body.categories
      : [req.body.categories];

    // Filter out empty/null values and trim whitespace
    const validCategories = categories
      .filter(cat => cat && typeof cat === 'string')
      .map(cat => cat.trim())
      .filter(cat => cat !== '');

    if (validCategories.length === 0) {
      return res.status(400).json({
        error: "Invalid categories",
        message: "At least one valid category is required"
      });
    }

    // Fetch all trips and filter in memory to handle both array format and legacy comma-separated format
    const allTrips = await Trips.find({})
      .populate('host')
      .sort({ date: -1 });

    // Filter trips where any category matches
    const matchingTrips = allTrips.filter((trip) => {
      // Handle case where categories is empty or undefined
      if (!trip.categories || !Array.isArray(trip.categories) || trip.categories.length === 0) {
        return false;
      }

      // Handle multiple formats:
      // 1. Array format: ["Desert", "Adventure"] - direct array
      // 2. Stringified JSON array: ["[\"TREKING\",\"Desert\"]"] - needs parsing
      // 3. Comma-separated string: ["Desert,Adventure"] - needs splitting
      const tripCategories = [];

      trip.categories.forEach(cat => {
        if (typeof cat === 'string') {
          // Check if it's a stringified JSON array (starts with [ and ends with ])
          if (cat.trim().startsWith('[') && cat.trim().endsWith(']')) {
            try {
              // Try to parse as JSON array
              const parsed = JSON.parse(cat);
              if (Array.isArray(parsed)) {
                // If parsed successfully and it's an array, add all elements
                parsed.forEach(c => {
                  if (typeof c === 'string') {
                    tripCategories.push(c.trim());
                  }
                });
              } else {
                // If parsed but not array, treat as single category
                tripCategories.push(String(parsed).trim());
              }
            } catch (e) {
              // If JSON parsing fails, try comma-separated format
              if (cat.includes(',')) {
                const splitCats = cat.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
                tripCategories.push(...splitCats);
              } else {
                tripCategories.push(cat.trim());
              }
            }
          } else if (cat.includes(',')) {
            // Comma-separated format (legacy)
            const splitCats = cat.split(',').map(c => c.trim());
            tripCategories.push(...splitCats);
          } else {
            // Single category
            tripCategories.push(cat.trim());
          }
        } else if (Array.isArray(cat)) {
          // If category itself is an array, add all elements
          cat.forEach(c => {
            if (typeof c === 'string') {
              tripCategories.push(c.trim());
            }
          });
        }
      });

      // Check if any of the requested categories match any trip category
      return validCategories.some((category) =>
        tripCategories.some(tripCat =>
          tripCat.toLowerCase() === category.toLowerCase()
        )
      );
    });

    return res.status(200).json({
      message: "Trips retrieved successfully",
      data: matchingTrips,
    });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ------------------------- get all trips with filter -------------------------
export const GetAllTripsWithFilter = async (req, res) => {
  try {
    const { status, type } = req.body;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const trips = await Trips.find({
      $or: [{ status: status }, { type: type }],
    })
      .populate('host')
      .limit(limit)
      .skip(skip)
      .sort({ date: -1 });
    // Get the total count of trips that match the filter
    const totalTrips = await Trips.countDocuments({
      $or: [{ Status: status }, { type: type }],
    });

    // Send response with trip data and pagination info
    return res.status(200).json({
      message: "Trips retrieved successfully",
      data: trips,
      currentPage: page,
      totalPages: Math.ceil(totalTrips / limit),
      totalTrips,
    });
  } catch (error) {
    // Handle any errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ------------------------- delete trip -------------------------
export const deleteTrips = async (req, res) => {
  try {
    // First find the trip to get the file URLs
    const trip = await Trips.findById(req.body._id);

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Collect all file URLs for deletion
    const filesToDelete = [];

    // Add banner image to deletion list if it exists
    if (trip.bannerImage) {
      filesToDelete.push(trip.bannerImage);
    }

    // Add card image to deletion list if it exists
    if (trip.cardImage) {
      filesToDelete.push(trip.cardImage);
    }

    // Add itinerary image to deletion list if it exists
    if (trip.itenarryImg) {
      filesToDelete.push(trip.itenarryImg);
    }

    // Add all gallery images to deletion list if they exist
    if (trip.gallaryImages && trip.gallaryImages.length > 0) {
      trip.gallaryImages.forEach(imageUrl => {
        if (imageUrl) {
          filesToDelete.push(imageUrl);
        }
      });
    }

    // Delete the trip from database
    const dbooking = await Trips.findByIdAndDelete({ _id: req.body._id });

    // Delete files from S3 after successful database deletion
    if (filesToDelete.length > 0) {
      await deleteMultipleFromS3(filesToDelete);
    }

    return res.status(200).json({ message: "Trip deleted successfully" });
  } catch (error) {
    console.error("Error deleting trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// delete one specific gallery image from trip
export const deleteTripGalleryImage = async (req, res) => {
  try {
    const { _id, imageUrl } = req.body;

    if (!_id) {
      return res.status(400).json({ error: "Trip ID is required" });
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    // Find the trip
    const trip = await Trips.findById(_id);

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    // Get current gallery images
    const currentImages = trip.gallaryImages || [];

    // Check if image exists
    if (!currentImages.includes(imageUrl)) {
      return res.status(404).json({ error: "Image not found in trip gallery" });
    }

    // Filter out the image to be deleted
    const updatedImages = currentImages.filter(url => url !== imageUrl);

    // Update the trip with filtered images
    const updatedTrip = await Trips.findByIdAndUpdate(
      _id,
      { gallaryImages: updatedImages },
      { new: true }
    );

    // Delete the specified image from S3
    await deleteMultipleFromS3([imageUrl]);

    return res.status(200).json({
      message: "Image deleted successfully",
      data: updatedTrip,
      deletedImage: imageUrl
    });
  } catch (error) {
    console.error("Error deleting trip image:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// upload one new gallery image to existing trip
export const uploadTripGalleryImage = async (req, res) => {
  const fields = [
    { name: "gallaryImages", maxCount: 1 },
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
        return res.status(400).json({ error: "Trip ID is required" });
      }

      // Find the trip
      const trip = await Trips.findById(_id);

      if (!trip) {
        await cleanupUploadedFiles(req);
        return res.status(404).json({ error: "Trip not found" });
      }

      const updates = {};

      // Process uploaded gallery image
      if (req?.uploadedFiles?.gallaryImages && req?.uploadedFiles?.gallaryImages?.length > 0) {
        const newImage = req.uploadedFiles.gallaryImages[0].url;
        const existingImages = trip.gallaryImages || [];
        updates.gallaryImages = [...existingImages, newImage];
      }

      // Update the trip
      const updatedTrip = await Trips.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      return res.status(200).json({
        message: "Image uploaded successfully",
        data: updatedTrip
      });
    } catch (error) {
      console.error("Error uploading trip image:", error);

      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);

      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

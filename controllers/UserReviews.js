import { UserReviews } from "../models/index.js";
import { deleteMultipleFromS3 } from "../middlewares/index.js";

// ------------------------- add user review -------------------------
export const addUserReview = async (req, res) => {
    try {
        const {
            userId, tripId, hostId, rating, review, name, tripName, date,
            source, location, entityType, externalId, googleAuthorUrl,
        } = req.body;

        // Validate required fields.
        // Reviews may be submitted by guests (no auth) from the host detail
        // page, so userId is optional — but a review must be tied to a host
        // or a trip.
        if (!hostId && !tripId) {
            // Clean up uploaded files if validation fails
            if (req.uploadedFiles) {
                const filesToDelete = [];
                Object.values(req.uploadedFiles).flat().forEach(file => {
                    if (file.key) filesToDelete.push(file.key);
                });
                if (filesToDelete.length > 0) {
                    await deleteMultipleFromS3(filesToDelete);
                }
            }
            return res.status(400).json({
                error: "Validation error",
                message: "hostId or tripId is required"
            });
        }

        // Get profile image URL from uploaded files (S3)
        let profileImage = null;

        if (req.uploadedFiles && Object.keys(req.uploadedFiles).length > 0) {
            // Get image from S3 upload - accept ANY field name (flexible)
            // Find the first uploaded file regardless of field name
            const fieldNames = Object.keys(req.uploadedFiles);
            const firstFieldName = fieldNames[0];
            const uploadedImage = req.uploadedFiles[firstFieldName];

            if (uploadedImage && uploadedImage.length > 0) {
                profileImage = uploadedImage[0].url;
            }
        }

        // Fallback to body if no file was uploaded (for backward compatibility)
        if (!profileImage && req.body.profileImage) {
            // Helper function to convert profileImage to string
            const convertToImageString = (imageValue) => {
                if (!imageValue) return null;
                if (typeof imageValue === 'string') {
                    return imageValue.trim() || null;
                }
                if (typeof imageValue === 'object') {
                    if (imageValue.url) return imageValue.url;
                    if (imageValue.path) return imageValue.path;
                    if (Object.keys(imageValue).length === 0) return null;
                    return JSON.stringify(imageValue);
                }
                return String(imageValue) || null;
            };
            profileImage = convertToImageString(req.body.profileImage);
        }

        // Scope + provenance. entityType is host when a hostId is present,
        // otherwise trip — so host and trip reviews never get confused.
        const resolvedEntityType =
            entityType || (hostId ? "host" : tripId ? "trip" : undefined);
        const allowedSources = ["traveller", "manual", "google"];
        const resolvedSource = allowedSources.includes(source) ? source : "traveller";

        // Create new user review
        const newUserReview = new UserReviews({
            userId,
            tripId: tripId || null,
            hostId: hostId || null,
            rating: rating !== undefined ? Number(rating) : 0,
            review: review || "",
            name: name || "",
            tripName: tripName || "",
            profileImage: profileImage,
            date: date ? new Date(date) : new Date(),
            entityType: resolvedEntityType,
            source: resolvedSource,
            location: location || "",
            externalId: externalId || null,
            googleAuthorUrl: googleAuthorUrl || null,
        });

        await newUserReview.save();

        return res.status(201).json({
            success: true,
            message: "User review added successfully",
            data: newUserReview
        });
    } catch (error) {
        console.error("Error adding user review:", error);

        // Clean up uploaded files if save fails
        if (req.uploadedFiles) {
            const filesToDelete = [];
            Object.values(req.uploadedFiles).flat().forEach(file => {
                if (file.key) filesToDelete.push(file.key);
            });
            if (filesToDelete.length > 0) {
                await deleteMultipleFromS3(filesToDelete);
            }
        }

        return res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
};

// ------------------------- get user reviews -------------------------
export const getUserReviews = async (req, res) => {
    try {
        // Support both query params and body for userId
        const userId = req.query.userId || req.body.userId;

        if (!userId) {
            return res.status(400).json({
                error: "Validation error",
                message: "userId is required"
            });
        }

        // Get all reviews for the user, sorted by date (newest first)
        const userReviews = await UserReviews.find({ userId })
            .sort({ date: -1 });

        return res.status(200).json({
            success: true,
            message: "User reviews fetched successfully",
            data: userReviews,
            count: userReviews.length
        });
    } catch (error) {
        console.error("Error fetching user reviews:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
};

// ------------------------- get all users reviews -------------------------
export const getAllUsersReviews = async (req, res) => {
    try {
        // Optional pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Optional filtering by tripName
        const tripName = req.query.tripName || req.body.tripName;
        const query = tripName ? { tripName } : {};

        // Get all reviews with optional pagination and filtering
        const allReviews = await UserReviews.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalReviews = await UserReviews.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: "All user reviews fetched successfully",
            data: allReviews,
            count: allReviews.length,
            total: totalReviews,
            currentPage: page,
            totalPages: Math.ceil(totalReviews / limit)
        });
    } catch (error) {
        console.error("Error fetching all user reviews:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
};

// ------------------------- get all reviews by host id -------------------------
export const getAllReviewsByHostId = async (req, res) => {
    try {
        // Support both params and query/body for hostId
        const hostId = req.params.hostId || req.query.hostId || req.body.hostId;

        if (!hostId) {
            return res.status(400).json({
                error: "Validation error",
                message: "hostId is required"
            });
        }

        // Optional pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Get all reviews for the host with optional pagination, sorted by date (newest first)
        const reviews = await UserReviews.find({ hostId })
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalReviews = await UserReviews.countDocuments({ hostId });

        return res.status(200).json({
            success: true,
            message: "Reviews fetched successfully",
            data: reviews,
            count: reviews.length,
            total: totalReviews,
            currentPage: page,
            totalPages: Math.ceil(totalReviews / limit)
        });
    } catch (error) {
        console.error("Error fetching reviews by host id:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
};

// ------------------------- get user reviews by trip id -------------------------
export const getuserReviewsByTripId = async (req, res) => {
    try {
        // Support both params and query/body for tripId
        const tripId = req.params.tripId || req.query.tripId || req.body.tripId;

        if (!tripId) {
            return res.status(400).json({
                error: "Validation error",
                message: "tripId is required"
            });
        }

        // Optional pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Get all reviews for the trip with optional pagination, sorted by date (newest first)
        const reviews = await UserReviews.find({ tripId })
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalReviews = await UserReviews.countDocuments({ tripId });

        return res.status(200).json({
            success: true,
            message: "User reviews fetched successfully by trip ID",
            data: reviews,
            count: reviews.length,
            total: totalReviews,
            currentPage: page,
            totalPages: Math.ceil(totalReviews / limit)
        });
    } catch (error) {
        console.error("Error fetching user reviews by trip id:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
};   
// ------------------------- delete user review (admin) -------------------------
// Removes a single review by its _id. Used by the admin host-review manager.
export const deleteUserReview = async (req, res) => {
    try {
        const id = req.params.id || req.body.id || req.body._id;
        if (!id) {
            return res.status(400).json({
                error: "Validation error",
                message: "review id is required",
            });
        }

        const deleted = await UserReviews.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({
                error: "Not found",
                message: "Review not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Review deleted successfully",
            data: deleted,
        });
    } catch (error) {
        console.error("Error deleting user review:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message,
        });
    }
};

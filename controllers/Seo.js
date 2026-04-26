// seo controller
import Seo from "../models/Seo.js";

// ------------------------- add SEO -------------------------
export const addSeo = async (req, res) => {
    try {
        const {
            home,
            allPackages,
            aboutUs,
            careers,
            blog,
            contactUs,
            // Legacy fields
            title,
            description,
            keywords,
            url,
            image,
        } = req.body;

        // Helper function to validate and format page SEO data
        const formatPageSeo = (pageData) => {
            if (!pageData) return { title: "", description: "" };
            return {
                title: pageData.title || "",
                description: pageData.description || "",
            };
        };

        // Create new SEO entry
        const newSeo = new Seo({
            home: formatPageSeo(home),
            allPackages: formatPageSeo(allPackages),
            aboutUs: formatPageSeo(aboutUs),
            careers: formatPageSeo(careers),
            blog: formatPageSeo(blog),
            contactUs: formatPageSeo(contactUs),
            // Legacy fields
            title: title || "",
            description: description || "",
            keywords: keywords || "",
            url: url || "",
            image: image || "",
        });

        await newSeo.save();

        return res.status(201).json({
            success: true,
            message: "SEO data added successfully",
            data: newSeo,
        });
    } catch (error) {
        console.error("Error adding SEO:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message,
        });
    }
};

// ------------------------- update SEO -------------------------
export const updateSeo = async (req, res) => {
    try {
        // Support _id from params, query, or body
        const _id = req.params._id || req.query._id || req.body._id;

        let existingSeo;
        let seoId = _id;

        // If no ID provided, get the latest SEO entry (assuming single SEO config)
        if (!seoId) {
            existingSeo = await Seo.findOne().sort({ _id: -1 });
            if (existingSeo) {
                seoId = existingSeo._id;
            } else {
                // If no SEO entry exists, create a new one instead of updating
                return res.status(404).json({
                    error: "Not found",
                    message: "No SEO data found. Please create SEO data first using add-seo endpoint.",
                });
            }
        } else {
            // Find existing SEO entry by ID
            existingSeo = await Seo.findById(seoId);
            if (!existingSeo) {
                return res.status(404).json({
                    error: "Not found",
                    message: "SEO data not found",
                });
            }
        }

        const {
            home,
            allPackages,
            aboutUs,
            careers,
            blog,
            contactUs,
            // Legacy fields
            title,
            description,
            keywords,
            url,
            image,
        } = req.body;

        // Helper function to validate and format page SEO data
        const formatPageSeo = (pageData) => {
            if (!pageData) return undefined;
            return {
                title: pageData.title !== undefined ? pageData.title : "",
                description: pageData.description !== undefined ? pageData.description : "",
            };
        };

        const updateData = {};

        // Update page SEO data if provided
        if (home !== undefined) {
            updateData.home = formatPageSeo(home);
        }
        if (allPackages !== undefined) {
            updateData.allPackages = formatPageSeo(allPackages);
        }
        if (aboutUs !== undefined) {
            updateData.aboutUs = formatPageSeo(aboutUs);
        }
        if (careers !== undefined) {
            updateData.careers = formatPageSeo(careers);
        }
        if (blog !== undefined) {
            updateData.blog = formatPageSeo(blog);
        }
        if (contactUs !== undefined) {
            updateData.contactUs = formatPageSeo(contactUs);
        }

        // Update legacy fields if provided
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (keywords !== undefined) updateData.keywords = keywords;
        if (url !== undefined) updateData.url = url;
        if (image !== undefined) updateData.image = image;

        // Update SEO entry
        const updatedSeo = await Seo.findByIdAndUpdate(seoId, updateData, {
            new: true,
        });

        return res.status(200).json({
            success: true,
            message: "SEO data updated successfully",
            data: updatedSeo,
        });
    } catch (error) {
        console.error("Error updating SEO:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message,
        });
    }
};

// ------------------------- get SEO -------------------------
export const getSeo = async (req, res) => {
    try {
        // Get the first SEO entry (assuming single SEO configuration)
        // Or get by ID if provided
        const { _id } = req.body;

        let seoData;
        if (_id) {
            seoData = await Seo.findById(_id);
        } else {
            // Get the first/latest SEO entry
            seoData = await Seo.findOne().sort({ _id: -1 });
        }

        if (!seoData) {
            return res.status(404).json({
                error: "Not found",
                message: "SEO data not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "SEO data retrieved successfully",
            data: seoData,
        });
    } catch (error) {
        console.error("Error fetching SEO:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message,
        });
    }
};

// ------------------------- get all SEO -------------------------
export const getAllSeo = async (req, res) => {
    try {
        const allSeo = await Seo.find().sort({ _id: -1 });

        return res.status(200).json({
            success: true,
            message: "All SEO data retrieved successfully",
            data: allSeo,
            count: allSeo.length,
        });
    } catch (error) {
        console.error("Error fetching all SEO:", error);
        return res.status(500).json({
            error: "Internal server error",
            message: error.message,
        });
    }
};

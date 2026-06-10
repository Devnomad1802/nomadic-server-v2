// seo model
import mongoose from "mongoose";

const pageSeoSchema = {
    title: { type: String, default: "" },
    description: { type: String, default: "" }
};

const seoSchema = mongoose.Schema({
    home: {
        type: pageSeoSchema,
        default: { title: "", description: "" }
    },
    allPackages: {
        type: pageSeoSchema,
        default: { title: "", description: "" }
    },
    aboutUs: {
        type: pageSeoSchema,
        default: { title: "", description: "" }
    },
    careers: {
        type: pageSeoSchema,
        default: { title: "", description: "" }
    },
    blog: {
        type: pageSeoSchema,
        default: { title: "", description: "" }
    },
    contactUs: {
        type: pageSeoSchema,
        default: { title: "", description: "" }
    },
    // Optional: Keep legacy fields for backward compatibility
    title: { type: String, required: false },
    description: { type: String, required: false },
    keywords: { type: String, required: false },
    url: { type: String, required: false },
    image: { type: String, required: false },
});

export default mongoose.model("Seo", seoSchema);
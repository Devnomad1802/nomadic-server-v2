import { Coupon } from "../models/index.js";
import { CouponTypeList } from "../models/index.js";

import { uploadFiles } from "../middlewares/index.js";

export const addCoupon = async (req, res) => {
  const {
    Select_Coupon_type,
    Coupon_Title,
    Description,
    Coupon_Name,
    Coupon_percentage,
  } = req.body;

  try {
    const addCoupon = new Coupon({
      Select_Coupon_type,
      Coupon_Title,
      Description,
      Coupon_Name,
      Coupon_percentage,
      Date: new Date(new Date().toUTCString()),
    });

    await addCoupon.save();

    return res
      .status(200)
      .json({ message: "Trip added successfully", data: addCoupon });
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const updateCoupon = async (req, res) => {
  const { _id } = req.body;
  const {
    Select_Coupon_type,
    Coupon_Title,
    Description,
    Coupon_Name,
    Coupon_percentage,
  } = req.body;

  try {
    const updates = {};

    // Add fields to updates object only if they are present in the request body
    if (Select_Coupon_type) updates.Select_Coupon_type = Select_Coupon_type;
    if (Coupon_Title) updates.Coupon_Title = Coupon_Title;
    if (Description) updates.Description = Description;
    if (Coupon_Name) updates.Coupon_Name = Coupon_Name;
    if (Coupon_percentage) updates.Coupon_percentage = Coupon_percentage;

    // Update the document by ID
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      _id,
      { $set: updates },
      { new: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    return res.status(200).json({
      message: "Coupon updated successfully",
      data: updatedCoupon,
    });
  } catch (error) {
    console.error("Error updating coupon:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const getAllCoupon = async (req, res) => {
  try {
    const getCoupon = await Coupon.find().sort({ Date: -1 });

    // Respond with the list of blog
    return res
      .status(200)
      .json({ message: "All blog retrieved successfully", data: getCoupon });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const getCouponTypeList = async (req, res) => {
  try {
    const getCouponTypeList = await CouponTypeList.find().sort({ Date: -1 });

    // Respond with the list of blog
    return res.status(200).json({
      message: "All blog retrieved successfully",
      data: getCouponTypeList,
    });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const deleteCoupon = async (req, res) => {
  try {
    const dBanner = await Coupon.findByIdAndDelete({ _id: req.body._id });
    if (!dBanner) {
      return res.status(400).send("NO DATA FOUND");
    }
    return res.status(200).send("DELETED");
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

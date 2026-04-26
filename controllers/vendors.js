import { Vendor } from "../models/index.js";
export const addVendor = async (req, res) => {
  const {
    First_Name,
    Last_Name,
    Email,
    Mobile_1,
    Mobile_2,
    Location,
    Remarks,
  } = req.body;

  try {
    const addTrip = new Vendor({
      First_Name,
      Location,
      Last_Name,
      Email,
      Mobile_1,
      Mobile_2,
      Remarks,
      Date: new Date(new Date().toUTCString()),
    });

    await addTrip.save();

    return res
      .status(200)
      .json({ message: "Trip added successfully", data: addTrip });
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const updateVendor = async (req, res) => {
  const { _id } = req.body;
  const {
    First_Name,
    Last_Name,
    Email,
    Mobile_1,
    Mobile_2,
    Location,
    Remarks,
  } = req.body;

  try {
    const updates = {};

    // Add fields to updates object only if they are present in the request body
    if (First_Name) updates.First_Name = First_Name;
    if (Last_Name) updates.Last_Name = Last_Name;
    if (Email) updates.Email = Email;
    if (Mobile_1) updates.Mobile_1 = Mobile_1;
    if (Mobile_2) updates.Mobile_2 = Mobile_2;
    if (Location) updates.Location = Location;
    if (Remarks) updates.Remarks = Remarks;

    // Update the document by ID
    const updatedVendor = await Vendor.findByIdAndUpdate(
      _id,
      { $set: updates },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    return res.status(200).json({
      message: "Vendor updated successfully",
      data: updatedVendor,
    });
  } catch (error) {
    console.error("Error updating vendor:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const deleteVendor = async (req, res) => {
  try {
    const dBanner = await Vendor.findByIdAndDelete({ _id: req.body._id });
    if (!dBanner) {
      return res.status(400).send("NO DATA FOUND");
    }
    return res.status(200).send("DELETED");
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const GetAllVendors = async (req, res) => {
  try {
    // Fetch all trips from the database
    const getVendors = await Vendor.find();

    // Respond with the list of Vendor
    return res
      .status(200)
      .json({ message: "All Vendor retrieved successfully", data: getVendors });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving Vendor:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

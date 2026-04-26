import { Enquire } from "../models/index.js";
import { uploadFiles } from "../middlewares/index.js";
import moment from "moment";

export const initateEnquery = async (req, res) => {
  try {
    const { Name, Phone, Email, Message, userId } = req.body;
    const user = await Enquire.findOne({ _id: req.body._id });
    if (user) {
      let message = [];
      message.push({
        Message: req.body.Message,
        MessageBy: "User",
        Date: new Date(new Date().toUTCString()),
      });
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $set: { Message: req.body.Message } },
        { new: true }
      );
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $push: { chat: message } },
        { new: true }
      );
      return res.status(200).json({ message: "updateed " });
    } else {
      const addTrip = new Enquire({
        userId,
        Name,
        Phone,
        Email,
        Message,
        chat: [
          {
            Message: req.body.Message,
            MessageBy: "User",
            Date: new Date(new Date().toUTCString()),
          },
        ],
        Date: new Date(new Date().toUTCString()),
      });

      await addTrip.save();
      return res
        .status(200)
        .json({ message: "Trip added successfully", data: addTrip });
    }
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const replyEnquery = async (req, res) => {
  try {
    const { Reply } = req.body;
    const user = await Enquire.findOne({ _id: req.body._id });
    if (user) {
      let message = [];
      message.push({
        Message: req.body.Reply,
        MessageBy: "Admin",
        Date: new Date(new Date().toUTCString()),
      });
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $set: { Reply: req.body.Reply } },
        { new: true }
      );
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $push: { chat: message } },
        { new: true }
      );
      return res.status(200).json({ message: "updateed " });
    }
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const getAllEnquries = async (req, res) => {
  try {
    let query = {};
    const { range } = req.query;

    if (range === "7days") {
      query.Date = { $gte: moment().subtract(7, "days").toDate() };
    } else if (range === "30days") {
      query.Date = { $gte: moment().subtract(30, "days").toDate() };
    }
    const blog = await Enquire.find(query).sort({ Date: -1 });

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
export const deleteEnqurie = async (req, res) => {
  try {
    const dBanner = await Enquire.findByIdAndDelete({ _id: req.body._id });
    if (!dBanner) {
      return res.status(400).send("NO DATA FOUND");
    }
    return res.status(200).send("DELETED");
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

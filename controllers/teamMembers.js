import { TeamMembers } from "../models/index.js";
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

export const addTeamMember = async (req, res) => {
  const fields = [{ name: "Photo", maxCount: 1 }];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    const { Name, Position } = req.body;

    try {
      // Process uploaded files from S3
      let Photo = null;
      if (req?.uploadedFiles?.Photo && req?.uploadedFiles?.Photo[0]) {
        Photo = req.uploadedFiles.Photo[0].url;
      }
      const addTeamMember = new TeamMembers({
        Name,
        Position,
        Photo,
        Date: new Date(new Date().toUTCString()),
      });

      await addTeamMember.save();

      return res
        .status(200)
        .json({ message: "Team member added successfully", data: addTeamMember });
    } catch (error) {
      console.error("Error adding team member:", error);
      
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      
      return res.status(500).json({ error: "Internal server error" });
    }
  });
};
export const getAllTeamMember = async (req, res) => {
  try {
    const Banner = await TeamMembers.find().sort({ Date: -1 });

    // Respond with the list of team members
    return res
      .status(200)
      .json({ message: "All team members retrieved successfully", data: Banner });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving team members:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const deleteTeamMember = async (req, res) => {
  try {
    // First find the team member to get the file URLs
    const teamMember = await TeamMembers.findById(req.body._id);
    
    if (!teamMember) {
      return res.status(404).json({ error: "Team member not found" });
    }

    // Collect file URL for deletion
    const filesToDelete = [];
    
    // Add photo to deletion list if it exists
    if (teamMember.Photo) {
      filesToDelete.push(teamMember.Photo);
    }
    
    // Delete the team member from database
    const dBanner = await TeamMembers.findByIdAndDelete({ _id: req.body._id });

    // Delete files from S3 after successful database deletion
    if (filesToDelete.length > 0) {
      await deleteMultipleFromS3(filesToDelete);
    }
    
    return res.status(200).json({ message: "Team member deleted successfully" });
  } catch (error) {
    console.error("Error deleting team member:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const updateTeamMember = async (req, res) => {
  const fields = [{ name: "Photo", maxCount: 1 }];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    try {
      const updates = {};
      const { _id } = req.body;

      const { Name, Position } = req.body;
      if (Name) updates.Name = Name;
      if (Position) updates.Position = Position;
      if (req?.uploadedFiles?.Photo && req?.uploadedFiles?.Photo[0]) {
        updates.Photo = req.uploadedFiles.Photo[0].url;
      }
      const updatedTeamMember = await TeamMembers.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      if (!updatedTeamMember) {
        await cleanupUploadedFiles(req);
        return res.status(404).json({ error: "Team member not found" });
      }

      return res.status(200).json({
        message: "Team member updated successfully",
        data: updatedTeamMember,
      });
    } catch (error) {
      console.error("Error updating team member:", error);
      
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      
      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

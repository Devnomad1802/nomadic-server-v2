import { Router } from "express";
import { catchAsync } from "../middlewares/index.js";
import {
  addTeamMember,
  getAllTeamMember,
  deleteTeamMember,
  updateTeamMember,
} from "../controllers/teamMembers.js";
import passport from "passport";

export const TeamMemberRouts = Router();
TeamMemberRouts.post("/addTeamMember", catchAsync(addTeamMember));
TeamMemberRouts.delete("/deleteTeamMember", catchAsync(deleteTeamMember));
TeamMemberRouts.get("/getAllTeamMember", catchAsync(getAllTeamMember));
TeamMemberRouts.post("/updateTeamMember", catchAsync(updateTeamMember));

export default TeamMemberRouts;

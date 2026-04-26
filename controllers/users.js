import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import twilio from "twilio";
import bcrypt from "bcrypt";
import "dotenv/config";
import AWS from "aws-sdk";
import {
  generateOtp,
  sendOtp,
  storeOtp,
  verifyOtp,
} from "../middlewares/otpService.js";

import { BadRequest, logIn, uploadFilesToS3, deleteMultipleFromS3 } from "../middlewares/index.js";
import { User, Trips } from "../models/index.js";
import {
  sendVerificationMail,
  client,
  sendResetMail,
  sendSecondaryVerificationMail,
} from "../utils/index.js";
import { admin, sendVerificationMailAdmin } from "../utils/adminSendMail.js";

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const sns = new AWS.SNS({ apiVersion: "2010-03-31" });
export const awsSmsTesting = async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    const params = {
      Message: message,
      PhoneNumber: phoneNumber,
    };

    sns.publish(params, (err, data) => {
      if (err) {
        res.status(500).send({ error: err.message });
      } else {
        res.status(200).send({ MessageId: data.MessageId });
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const {
  VERIFICATION_SECRET,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_SMS_SERVICE,
} = process.env;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Register
export const register = async (req, res) => {
  const { name, email, phone, password, gender, role } = req.body;
  console.log("register Data", name, email, phone, password, gender);
  if (![name, email, phone, password].every(Boolean))
    throw new BadRequest("Please fill all inputs!");

  try {
    const checkUser = await User.findOne({ email });
    if (checkUser) {
      throw new BadRequest("Email Already in use");
    }

    const user = new User({
      name,
      email,
      phone,
      password,
      gender,
      role,
    });

    const tokenForEmailConfirm = jwt.sign(
      { userId: user?._id },
      VERIFICATION_SECRET,
      { expiresIn: "30m" }
    );

    user.verificationToken = tokenForEmailConfirm;
    await user.save();
    if (role === "Admin") {
      await sendVerificationMailAdmin(user);
      const token = await logIn({ _id: user?._id });

      res.status(201).json({
        success: true,
        message: "Please Check Your Email For Confirmation Link",
        token,
      });
    } else {
      await sendVerificationMail(user);
      const token = await logIn({ _id: user?._id });

      res.status(201).json({
        success: true,
        message: "Please Check Your Email For Confirmation Link",
        token,
      });
    }
  } catch (error) {
    throw new BadRequest(error);
  }
};

// Get all users
export const getAllUsers = async (req, res) => {
  const page = parseInt(req.query.page) || 1; // Current page, default 1
  const limit = 10; // Number of users per page
  try {
    const users = await User.find()
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(201).json({
      success: true,
      users,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get user by ID
export const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      user,
    });
  } catch (error) {
    console.error("Error retrieving user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const secondaryEmailRegister = async (req, res) => {
  const { secondaryEmail } = req.body;
  const checkUser = await User.findOne({ secondaryEmail });
  const emailIsExit = await User.find({ email: secondaryEmail });
  if (emailIsExit.length > 0) {
    throw new BadRequest("Email Already in use as Primary Email");
  }
  const user = await User.findById(req?.user?._id);
  if (checkUser || !user) {
    throw new BadRequest("Email Already in use");
  }

  const tokenForEmailConfirm = jwt.sign(
    user?._id.toString(),
    VERIFICATION_SECRET
  );
  const emailTokeExpiry = dayjs().add(15, "minute");
  User.findOneAndUpdate(
    { _id: req?.user?._id },
    { verificationToken: { token: tokenForEmailConfirm, emailTokeExpiry } }
  );
  await sendSecondaryVerificationMail(user, secondaryEmail);
  res.status(201).json({
    success: true,
    message: "Please Check Your Email For Confirmation Link",
  });
  console.log("route hit");
};

// Check if secondary  Email Verified
export const secondaryEmailverifyEmail = async (req, res) => {
  const { token, email } = req.query;
  const findUser = await User.findOne({
    "verificationToken.token": token,
  });

  if (!findUser) {
    throw new BadRequest("User Not Found");
  }
  if (dayjs().isAfter(findUser?.verificationToken?.expiry)) {
    throw new BadRequest("Token Expired");
  }

  await User.findOneAndUpdate(
    {
      "verificationToken.token": token,
    },
    {
      isVerified: true,
      secondaryEmail: email,
    }
  );

  res.send(getRedirectBodytwo("Email Verified"));
};

// Email Varify
export const verifyEmail = async (req, res) => {
  const { token } = req.query;

  // console.log("VERIFICATION_SECRET", VERIFICATION_SECRET);
  const user = jwt.verify(token, VERIFICATION_SECRET, (err, decoded) => {
    if (err) {
      throw new BadRequest("Token Expired");
    }
    return decoded;
  });
  // console.log("user", user.userId);
  if (!user) {
    throw new BadRequest("Token Expired");
  }

  const findUser = await User.findOne({ _id: user.userId });
  if (!findUser) {
    throw new BadRequest("User not found");
  }

  await User.findOneAndUpdate(
    {
      verificationToken: token,
    },
    {
      isVerified: true,
    }
  );

  res.send(getRedirectBody("Email Verified"));
};
// Admin Email Varify
export const AdminverifyEmail = async (req, res) => {
  const { token } = req.query;

  const user = jwt.verify(token, VERIFICATION_SECRET);
  if (!user) {
    throw new BadRequest("Token Expired");
  }

  const findUser = await User.findById(user?.userId);
  if (!findUser) {
    throw new BadRequest("User not found");
  }

  await User.findOneAndUpdate(
    {
      verificationToken: token,
    },
    {
      isVerified: true,
    }
  );

  res.send(AdmingetRedirectBody("Email Verified"));
};

//Redirect Admin
const AdmingetRedirectBody = (message) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      div {
        width: 100vw;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: #FFFFFF;
        font-family: sans-serif;
      }
      h1 {
        color: #4B5563;
      }
    </style>
  </head>
  <body>
    <div>
      <h1>${message}</h1>
    </div>
    <script>
    setTimeout(() => {
        window.location.href = ${'"' + admin + '"'}
    }, 2000);
</script>
  </body>
</html>
      `;
// Send Code SMS
// export const sendSMCode = async (phone) => {
//   try {
//     console.log("phone in send sms....", phone);
//     const phoneNumber = `+${phone}`;
//     const ttlInSeconds = 600; // 10 minutes

//     // Send Verification Message with specified TTL
//     await twilioClient.verify.v2
//       .services("VA390909fe7e4bb7353ff8f0eb93050e4a")
//       .verifications.create({
//         to: phoneNumber,
//         channel: "sms",
//         ttl: ttlInSeconds,
//       });

//     return "Verification code sent successfully.";
//     // res.status(200).json({ message: "Verification code sent successfully." });
//     // Handle success if needed
//   } catch (error) {
//     console.error("Error sending verification code:", error);
//     // res.status(500).json({ error: "Error sending verification code" });
//     // Handle error if needed
//   }
// };
export const verifySMSCode = async (req, res) => {
  try {
    const { phone, code } = req.body;
    const user = await User.findOne({ phone: phone.phone });

    if (!user) {
      throw new BadRequest("User Not Found !");
    }
    const aa = "+" + phone.phone;
    // Send Verification Message
    const result = verifyOtp(aa, code);
    if (!result.valid) {
      return res.status(400).json({ error: result.message });
    }
    const updatedUser = await User.findByIdAndUpdate(
      { _id: user._id },
      { twoStepVerification: true, isLoggedIn: true }
    );
    const token = await logIn({ _id: user?._id });

    //   return res.status(200).json({
    //     status: verification_check?.status,
    //     data: updatedUser,
    //   });
    // } else {
    //   // Handle verification failure
    //   return res.status(200).json({
    //     status: verification_check?.status,
    //   });
    // }
    return res.status(200).json({
      message: result.message,
      success: true,
      user,
      token,
    });
  } catch (error) {
    console.error("Error verifying SMS code:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
// User LogIn
export const login = async (req, res) => {
  const { email, password } = req.body;
  console.log("email, pasword", email, password);
  if (![email, password].every(Boolean))
    throw new BadRequest("Please fill all inputs!");

  const user = await User.findOneAndUpdate({ email }, { isLoggedIn: false });

  if (!user || !(await user.matchesPassword(password))) {
    throw new BadRequest("Incorrect email or password");
  }

  const token = await logIn({ _id: user?._id });

  res.status(200).json({
    success: true,
    message: "Login Successflly!",
    token,
    user,
  });
};

// login With Phone
export const phoneLogin = async (req, res) => {
  const phone = req.body.phone;
  if (!phone) {
    throw new BadRequest("Please provide a phone number!"); // Check if number is provided
  }
  const user = await User.findOne({ phone: req.body.phone });
  if (!user) {
    throw new NotFoundError("Phone number not found!"); // Throw error if number doesn't exist
  }
  try {
    const otp = generateOtp();
    const aa = "+" + phone;

    await sendOtp(aa, otp);
    storeOtp(aa, otp);
    return res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error occurred:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//send Mail
export const sendMail = async (req, res) => {
  // console.log(req?.user);
  const user = await User.findById(req?.user?._id);

  if (!user) {
    throw new BadRequest("User Not Found !");
  }
  const tokenForEmailConfirm = jwt.sign(
    user?._id?.toString(),
    VERIFICATION_SECRET
  );
  const emailTokeExpiry = dayjs().add(15, "minute");

  await User.findByIdAndUpdate(user?._id, {
    verificationToken: { token: tokenForEmailConfirm, expiry: emailTokeExpiry },
  });
  await sendVerificationMail(user);

  res.status(200).json({
    success: true,
    message: "Please Check Your Mail For Confirmation",
  });
};

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

export const editUser = async (req, res) => {
  const fields = [{ name: "profileImage", maxCount: 1 }];
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload files" });
    }

    try {
      let user = await User.findOne({
        _id: req.body.userId,
      });
      if (!user) {
        await cleanupUploadedFiles(req);
        return res
          .status(400)
          .send({ msg: "user doesnot found in the database" });
      }

      // Update basic fields
      if (req.body.name !== undefined) user.name = req.body.name;
      if (req.body.email !== undefined) user.email = req.body.email;
      if (req.body.gender !== undefined) user.gender = req.body.gender;
      if (req.body.phone !== undefined) user.phone = req.body.phone;

      // Handle profile image upload
      const oldProfileImage = user.profileImage;
      if (req?.uploadedFiles?.profileImage && req?.uploadedFiles?.profileImage[0]) {
        user.profileImage = req.uploadedFiles.profileImage[0].url;

        // Delete old profile image from S3 if it exists
        if (oldProfileImage) {
          try {
            await deleteMultipleFromS3([oldProfileImage]);
          } catch (deleteError) {
            console.error("Error deleting old profile image:", deleteError);
            // Don't fail the request if deletion fails
          }
        }
      }

      // Handle password change
      if (req.body.currentPassword && req.body.currentPassword.length > 1) {
        // Fix: Use compareSync instead of hashSync for password comparison
        if (bcrypt.compareSync(req.body.currentPassword, user.password)) {
          if (req.body.newPassword) {
            user.password = req.body.newPassword;
          } else {
            await cleanupUploadedFiles(req);
            return res.status(400).send({ msg: "new password is required" });
          }
        } else {
          await cleanupUploadedFiles(req);
          return res.status(400).send({ msg: "wrong password" });
        }
      }

      const saved = await user.save();

      res.status(201).json({
        success: true,
        message: saved,
      });
    } catch (error) {
      await cleanupUploadedFiles(req);
      throw new BadRequest(error);
    }
  });
};

export const editinfluencer = async (req, res) => {
  try {
    let user = await User.findOne({
      _id: req.body.userId,
    });
    if (!user) {
      return res
        .status(400)
        .send({ msg: "user doesnot found in the database" });
    }
    // user.name = req.body.name;
    // user.email = req.body.email;
    user.influencer = req.body.influencer;
    // user.gender = req.body.gender;
    // user.phone = req.body.phone;
    const saved = await user.save();

    res.status(201).json({
      success: true,
      message: saved,
    });
  } catch (error) {
    throw new BadRequest(error);
  }
};
// forgotPassword
export const forgetPassword = async (req, res) => {
  const { email } = req.params;

  const userFound = await User.findOne({ email });
  if (!userFound) {
    throw new BadRequest("User Not Found");
  }

  const tokenForEmailConfirm = jwt.sign(
    { userId: userFound?._id },
    VERIFICATION_SECRET,
    {
      expiresIn: "30m", //15 minutes
    }
  );
  let user = await User.findByIdAndUpdate(
    { _id: userFound._id },
    { verificationToken: tokenForEmailConfirm },
    { new: true } //use to fetch updated record / user from DB
  );

  await sendResetMail(user);
  res.status(201).json({
    success: true,
    message: "Please Check Your Email For Confirmation",
  });
};
//change password
export const changePassword = async (req, res) => {
  const { token, password } = req.body;
  const userFound = await User.findOne({
    verificationToken: token,
  });
  if (!userFound) {
    throw new BadRequest("User Not Found");
  }

  await User.findOneAndUpdate(
    { verificationToken: token },
    { password: bcrypt.hashSync(password, 10) }
  );

  res.status(201).json({
    success: true,
    message: "Password Changed! Login Again",
  });
};
export const updateBookmark = async (req, res) => {
  const { userId, tripId, bookmark } = req.body;

  try {
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (bookmark) {
      // Add the trip to the user's bookmarks if it's not already there
      if (user.bookmarks.includes(tripId)) {
        return res.status(400).json({ message: "Trip already bookmarked" });
      }
      user.bookmarks.push(tripId);
      await user.save();
      return res
        .status(200)
        .json({ message: "Trip bookmarked successfully", TripId: tripId });
    } else {
      // Remove the trip from the user's bookmarks if it exists
      const index = user.bookmarks.indexOf(tripId);
      if (index > -1) {
        user.bookmarks.splice(index, 1);
        await user.save();
        return res.status(200).json({
          message: "Trip removed from bookmarks successfully",
          TripId: tripId,
        });
      } else {
        return res.status(400).json({ message: "Trip not found in bookmarks" });
      }
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const getBookmarkedTrips = async (req, res) => {
  const { userId } = req.body;
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  const usePagination = !isNaN(page) && !isNaN(limit) && limit > 0;

  try {
    // Find the user and get only bookmarks field
    const user = await User.findById(userId)
      .select("bookmarks")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If no bookmarks, return empty array
    if (!user.bookmarks || user.bookmarks.length === 0) {
      return res.status(200).json(usePagination ? { trips: [], total: 0, page, limit } : []);
    }

    let bookmarkIds = user.bookmarks;
    let responseData = {};

    // Apply pagination if requested
    if (usePagination) {
      const skip = (page - 1) * limit;
      bookmarkIds = user.bookmarks.slice(skip, skip + limit);
      responseData = {
        total: user.bookmarks.length,
        page,
        limit,
        totalPages: Math.ceil(user.bookmarks.length / limit)
      };
    }

    // Populate only essential fields from trips (exclude large arrays and text fields)
    const trips = await Trips.find({
      _id: { $in: bookmarkIds }
    })
      .select(
        "title subTitle price strikePrice location pickUp dropOff cardImage bannerImage days nights numberOfDays numberOfSeats selectDate endSelectDate type Trending trendingHeading enableBooking enableEnquire date firstBookingPrice ratings"
      )
      .lean();

    // Maintain backward compatibility: return array if no pagination, object if pagination requested
    if (usePagination) {
      res.status(200).json({ ...responseData, trips });
    } else {
      res.status(200).json(trips);
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const deleteUser = async (req, res) => {
  try {
    if (!req.body.userId) {
      return res.status(404).json({ message: "Please enter userId" });
    }
    const user = await User.findOneAndDelete({ _id: req.body.userId });
    res.status(200).json({
      success: true,
      message: "User Deleted Successfully",
    });
  } catch (error) {
    throw new BadRequest(error);
  }
};
export const getAllTripsWithUserBookmark = async (req, res) => {
  // const { userId } = ;

  try {
    const user = await User.findOne({ _id: req.body.userId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get all trips
    const trips = await Trips.find({});

    // Check if each trip is bookmarked by the user
    const tripsWithBookmarkStatus = trips.map((trip) => {
      return {
        ...trip.toObject(),
        bookmarked: user.bookmarks.includes(trip._id),
      };
    });

    res.status(200).json(tripsWithBookmarkStatus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
const getRedirectBody = (message) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      div {
        width: 100vw;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: #FFFFFF;
        font-family: sans-serif;
      }
      h1 {
        color: #4B5563;
      }
    </style>
  </head>
  <body>
    <div>
      <h1>${message}</h1>
    </div>
    <script>
    setTimeout(() => {
        window.location.href = ${'"' + client + '"'}
    }, 2000);
</script>
  </body>
</html>
      `;

const getRedirectBodytwo = (message) => `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="X-UA-Compatible" content="IE=edge" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Document</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              min-width: 100vw;
              width: 100%;
              min-height: 100vh;
              height: 100%;
              display: flex;
              justify-content: center;
              align-items: center;
              background-color: #353535;
              font-family: sans-serif;
            }
            div {
              text-align: center;
              max-width: 600px;
              width: 100%;
              border: 1px solid red;
              padding: 50px;
              background: #31312c;
              backdrop-filter: blur(5px);
              border-radius: 15px;
              border: 2px solid #d09b03;
              padding: 50px;
            }
            h1 {
              margin-top: 30px;
              background: linear-gradient(
                180deg,
                #d09b03 0%,
                #fef9c8 35.06%,
                #d38d00 74.31%,
                #fff8c4 116%
              );
              -webkit-text-fill-color: transparent;
              -webkit-background-clip: text;
            }
          </style>
        </head>
        <body>
          <div>
            <img
              src="data:image/png;base64,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"
              alt="email"
              srcset=""
              width="150px"
            />
            <h1>You've successfully confirmed your secondary e-mail address</h1>
          </div>
          <script>
          setTimeout(() => {
              window.location.href = ${'"' + client + "/dashboard/vault-creation-completed" + '"'
  }
          }, 2000);
      </script>
        </body>
      </html>


      `;

import { Host } from "../models/hosts.js";
import { Trips } from "../models/trips.js";
import {
  BadRequest,
  CustomError,
  uploadFilesToS3,
  deleteFromS3,
  deleteMultipleFromS3,
} from "../middlewares/index.js";
// RazorpayX imports commented out for now
// import { createContactService, createFundAccountService, updateContactService } from "../services/razorpayxService.js";

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

// Create a new host with file uploads
export const createHost = async (req, res, next) => {
  // Define the fields that can contain files
  const fields = [
    { name: "panCard", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "bankPassbook", maxCount: 1 },
    { name: "businessLicense", maxCount: 1 },
    { name: "brandingLogo", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "gallery", maxCount: 10 }, // Allow up to 10 gallery images
  ];

  // Use S3 upload middleware
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      // Clean up any partially uploaded files
      await cleanupUploadedFiles(req);
      return next(new BadRequest(`Failed to upload files: ${err.message}`));
    }

    try {
      const {
        // Basic Information
        hostName,
        location,
        city,
        state,
        pincode,
        completeAddress,

        // Business Information
        panNumber,
        gstNumber,

        // Bank Account Details
        bankName,
        accountHolderName,
        accountNumber,
        ifscCode,

        // Branding
        hostTitle,
        tagline,
        brandingLogo,
        coverImage,

        // About
        hostOverview,
        foundedYear,
        experience,
        hqLocation,
        achievements,

        // Specialties & Expertise
        specialties,

        // Trust & Service Quality
        isVerified,
        tripsHosted,
        successRate,
        responseTimeLabel,

        // Contact
        phoneNumber,
        emailAddress,
        whatsapp,
        supportHours,

        // Social Media
        socialMedia,

        // Finance
        commissionRate,

        // SEO
        seoTitle,
        seoSlug,
        metaDescription,
      } = req.body;

      if(!hostName || !emailAddress || !phoneNumber || !bankName || !accountHolderName || !accountNumber || !ifscCode) {
        // Clean up uploaded files if validation fails
        await cleanupUploadedFiles(req);
        return next(new BadRequest(" hostName, emailAddress, phoneNumber, bankName, accountHolderName, accountNumber, ifscCode are required"));
      }

      // Check if host already exists with same email or PAN
      const existingHost = await Host.findOne({
        $or: [{ emailAddress: emailAddress }, { panNumber: panNumber }],
      });

      if (existingHost) {
        // If host exists, clean up uploaded files
        await cleanupUploadedFiles(req);
        return next(
          new BadRequest("Host with this email or PAN number already exists")
        );
      }

      // Process uploaded files
      const documents = {};
      let gallery = [];
      let uploadedBrandingLogo = null;
      let uploadedCoverImage = null;

      if (req.uploadedFiles) {
        if (req.uploadedFiles.panCard && req.uploadedFiles.panCard[0]) {
          documents.panCard = req.uploadedFiles.panCard[0].url;
        }
        if (
          req.uploadedFiles.gstCertificate &&
          req.uploadedFiles.gstCertificate[0]
        ) {
          documents.gstCertificate = req.uploadedFiles.gstCertificate[0].url;
        }
        if (
          req.uploadedFiles.bankPassbook &&
          req.uploadedFiles.bankPassbook[0]
        ) {
          documents.bankPassbook = req.uploadedFiles.bankPassbook[0].url;
        }
        if (
          req.uploadedFiles.businessLicense &&
          req.uploadedFiles.businessLicense[0]
        ) {
          documents.businessLicense = req.uploadedFiles.businessLicense[0].url;
        }

        // Process branding images
        if (
          req.uploadedFiles.brandingLogo &&
          req.uploadedFiles.brandingLogo[0]
        ) {
          uploadedBrandingLogo = req.uploadedFiles.brandingLogo[0].url;
        }
        if (req.uploadedFiles.coverImage && req.uploadedFiles.coverImage[0]) {
          uploadedCoverImage = req.uploadedFiles.coverImage[0].url;
        }

        // Process gallery images
        if (req.uploadedFiles.gallery && req.uploadedFiles.gallery.length > 0) {
          gallery = req.uploadedFiles.gallery.map((file) => file.url);
        }
      }

      // Validate required documents - All documents are mandatory
      if (!documents.panCard) {
        await cleanupUploadedFiles(req);
        return next(new BadRequest("PAN Card document is required"));
      }
      if (!documents.gstCertificate) {
        await cleanupUploadedFiles(req);
        return next(new BadRequest("GST Certificate document is required"));
      }
      if (!documents.bankPassbook) {
        await cleanupUploadedFiles(req);
        return next(new BadRequest("Bank Passbook document is required"));
      }
      if (!documents.businessLicense) {
        await cleanupUploadedFiles(req);
        return next(new BadRequest("Business License document is required"));
      }

      // RazorpayX contact and fund account creation commented out for now
      // const hostData = {
      //   name: hostName,
      //   email: emailAddress,
      //   contact: phoneNumber,
      // }
      
      // // Create Contact and Fund Account with error handling
      // let contact, fundAccount;
      // try {
      //   // Create Contact
      //   contact = await createContactService(hostData);
      //   console.log("Contact created:", contact);
      //   // Create Fund Account
      //   fundAccount = await createFundAccountService(contact.id, {
      //     name: bankName,
      //     ifsc: ifscCode,
      //     account_number: accountNumber,
      //   });
      //   console.log("Fund Account created:", fundAccount);
      // } catch (error) {
      //   console.error("RazorpayX setup error:", error);
      //   // Clean up uploaded files if RazorpayX setup fails
      //   await cleanupUploadedFiles(req);
      //   return next(error); // This will be handled by the error middleware
      // }



      // Create new host
      const host = new Host({
        hostName,
        phoneNumber,
        completeAddress,
        city,
        pincode,
        emailAddress,
        location,
        state,
        commissionRate,
        panNumber,
        gstNumber,
        bankName,
        accountHolderName,
        accountNumber,
        ifscCode,
        // Branding
        hostTitle,
        tagline,
        brandingLogo: uploadedBrandingLogo || brandingLogo,
        coverImage: uploadedCoverImage || coverImage,
        // About
        hostOverview,
        foundedYear,
        experience,
        hqLocation,
        achievements: Array.isArray(achievements)
          ? achievements
          : achievements
          ? JSON.parse(achievements)
          : [],
        // Trust & Service Quality
        isVerified,
        tripsHosted: Number(tripsHosted),
        successRate: Number(successRate),
        responseTimeLabel,
        // Contact
        whatsapp,
        supportHours,
        // Social Media
        socialMedia: socialMedia ? JSON.parse(socialMedia) : {},
        // SEO
        seoTitle,
        seoSlug,
        metaDescription,
        // Specialties
        specialties: Array.isArray(specialties)
          ? specialties
          : specialties
          ? JSON.parse(specialties)
          : [],
        // Files
        documents,
        gallery,
        // RazorpayX IDs commented out for now
        // contact_id: contact?.id,
        // fund_account_id: fundAccount?.id,
      });

      await host.save();

      res.status(201).json({
        success: true,
        message: "Host created successfully",
        data: host,
      });
    } catch (error) {
      // If there's an error, clean up uploaded files
      await cleanupUploadedFiles(req);
      return next(new BadRequest(`Failed to upload files: ${err?.message || error?.message || error}`));
    }
  });
};

// Get all hosts with pagination and filters
export const getAllHosts = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    isVerified,
    isActive,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build filter object
  const filter = {};
  // if (status) filter.status = status;
  // if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
  // if (isActive !== undefined) filter.isActive = isActive === 'true';

  // Search functionality - now includes specialties search
  if (search) {
    filter.$or = [
      { hostName: { $regex: search, $options: "i" } },
      { emailAddress: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
      { city: { $regex: search, $options: "i" } },
      { state: { $regex: search, $options: "i" } },
      { specialties: { $regex: search, $options: "i" } }, // Search within specialties
    ];
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Execute query with pagination
  const hosts = await Host.find(filter)
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

  // Get total count for pagination
  const total = await Host.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: hosts,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
    },
  });
};

// Get host by ID
export const getHostById = async (req, res) => {
  const { id } = req.params;

  const host = await Host.findById(id);
  if (!host) {
    throw new CustomError("Host not found", 404);
  }

  res.status(200).json({
    success: true,
    data: host,
  });
};

// Update host with file upload support (full update - PUT)
export const updateHost = async (req, res, next) => {
  const { id } = req.params;

  // Define the fields that can contain files
  const fields = [
    { name: "panCard", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "bankPassbook", maxCount: 1 },
    { name: "businessLicense", maxCount: 1 },
    { name: "brandingLogo", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "gallery", maxCount: 10 }, // Allow up to 10 gallery images
  ];

  // Use S3 upload middleware
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      // Clean up any partially uploaded files
      await cleanupUploadedFiles(req);
      return next(new BadRequest(`Failed to upload files: ${err.message}`));
    }

    try {
      // Check if host exists after upload middleware so req.uploadedFiles is set
      const existingHost = await Host.findById(id);
      if (!existingHost) {
        await cleanupUploadedFiles(req);
        return next(new CustomError("Host not found", 404));
      }

      const updateData = { ...req.body };

      // Validate required fields that are being updated
      if ((updateData.hostName !== undefined && !updateData.hostName) ||
          (updateData.emailAddress !== undefined && !updateData.emailAddress) ||
          (updateData.phoneNumber !== undefined && !updateData.phoneNumber) ||
          (updateData.bankName !== undefined && !updateData.bankName) ||
          (updateData.accountHolderName !== undefined && !updateData.accountHolderName) ||
          (updateData.accountNumber !== undefined && !updateData.accountNumber) ||
          (updateData.ifscCode !== undefined && !updateData.ifscCode)) {
        // Clean up uploaded files if validation fails
        await cleanupUploadedFiles(req);
        return next(new BadRequest("hostName, emailAddress, phoneNumber, bankName, accountHolderName, accountNumber, ifscCode are required"));
      }

      // Check for duplicate email or PAN if they're being updated
      if (updateData.emailAddress || updateData.panNumber) {
        const duplicateCheck = await Host.findOne({
          $and: [
            { _id: { $ne: id } },
            {
              $or: [
                {
                  emailAddress:
                    updateData.emailAddress || existingHost.emailAddress,
                },
                { panNumber: updateData.panNumber || existingHost.panNumber },
              ],
            },
          ],
        });

        if (duplicateCheck) {
          // Clean up uploaded files if duplicate found
          await cleanupUploadedFiles(req);
          return next(
            new BadRequest("Host with this email or PAN number already exists")
          );
        }
      }

      // RazorpayX updates commented out for now
      // Handle RazorpayX updates
      // let updatedContactId = existingHost.contact_id;
      // let updatedFundAccountId = existingHost.fund_account_id;

      // // Check if contact details have changed
      // const contactDetailsChanged = 
      //   updateData.hostName !== existingHost.hostName ||
      //   updateData.emailAddress !== existingHost.emailAddress ||
      //   updateData.phoneNumber !== existingHost.phoneNumber;

      // if (contactDetailsChanged && existingHost.contact_id) {
      //   try {
      //     const contactData = {
      //       name: updateData.hostName || existingHost.hostName,
      //       email: updateData.emailAddress || existingHost.emailAddress,
      //       contact: updateData.phoneNumber || existingHost.phoneNumber,
      //     };
          
      //     const updatedContact = await updateContactService(existingHost.contact_id, contactData);
      //     console.log("Contact updated:", updatedContact);
      //     updatedContactId = updatedContact.id;
      //   } catch (error) {
      //     console.error("RazorpayX contact update error:", error);
      //     // Clean up uploaded files if RazorpayX update fails
      //     await cleanupUploadedFiles(req);
      //     return next(error);
      //   }
      // }

      // // Check if bank details have changed
      // const bankDetailsChanged = 
      //   updateData.bankName !== existingHost.bankName ||
      //   updateData.ifscCode !== existingHost.ifscCode ||
      //   updateData.accountNumber !== existingHost.accountNumber;

      // if (bankDetailsChanged) {
      //   try {
      //     const bankDetails = {
      //       name: updateData.bankName || existingHost.bankName,
      //       ifsc: updateData.ifscCode || existingHost.ifscCode,
      //       account_number: updateData.accountNumber || existingHost.accountNumber,
      //     };

      //     // Create new fund account (since fund accounts can't be updated)
      //     const newFundAccount = await createFundAccountService(updatedContactId, bankDetails);
      //     console.log("New Fund Account created:", newFundAccount);
      //     updatedFundAccountId = newFundAccount.id;
      //   } catch (error) {
      //     console.error("RazorpayX fund account creation error:", error);
      //     // Clean up uploaded files if RazorpayX update fails
      //     await cleanupUploadedFiles(req);
      //     return next(error);
      //   }
      // }

      // Handle file updates
      const oldFilesToDelete = [];
      const newDocuments = { ...existingHost.documents };
      let newGallery = existingHost.gallery || [];

      // Handle gallery images - combine uploaded files and body data
      if (req.uploadedFiles && req.uploadedFiles.gallery && req.uploadedFiles.gallery.length > 0) {
        // Get uploaded gallery images
        const uploadedGalleryImages = req.uploadedFiles.gallery.map(file => file.url);
        
        // Get gallery from body (if any)
        let bodyGalleryImages = [];
        if (updateData.previousGallery) {
          if (Array.isArray(updateData.previousGallery)) {
            bodyGalleryImages = updateData.previousGallery;
          } else if (typeof updateData.previousGallery === "string") {
            bodyGalleryImages = JSON.parse(updateData.previousGallery);
          }
        }
        
        // Combine uploaded images with body images
        newGallery = [...bodyGalleryImages, ...uploadedGalleryImages];
        
      } else if (updateData.previousGallery) {
        // Only body data, no uploaded files
        if (Array.isArray(updateData.previousGallery)) {
          newGallery = updateData.previousGallery;
        } else if (typeof updateData.previousGallery === "string") {
            newGallery = JSON.parse(updateData.previousGallery);
        }
      }

      // Check for deleted images - compare new gallery with existing gallery
      const existingGallery = existingHost.gallery || [];
      const deletedImages = existingGallery.filter(imageUrl => !newGallery.includes(imageUrl));
      
      if (deletedImages.length > 0) {
        console.log('Images to be deleted from S3:', deletedImages);
        oldFilesToDelete.push(...deletedImages);
      }
      let newBrandingLogo = existingHost.brandingLogo;
      let newCoverImage = existingHost.coverImage;

      // Check if any files were uploaded
      if (req.uploadedFiles && Object.keys(req.uploadedFiles).length > 0) {
        console.log("Files uploaded:", Object.keys(req.uploadedFiles));

        // Process each document type
        const documentTypes = [
          "panCard",
          "gstCertificate",
          "bankPassbook",
          "businessLicense",
        ];

        documentTypes.forEach((docType) => {
          if (req.uploadedFiles[docType] && req.uploadedFiles[docType][0]) {

            // If there's a new file, mark old file for deletion
            if (existingHost.documents[docType]) {
              oldFilesToDelete.push(existingHost.documents[docType]);
            }

            // Update with new file URL
            newDocuments[docType] = req.uploadedFiles[docType][0].url;
            } 
        });

        // Process branding images
        if (
          req.uploadedFiles.brandingLogo &&
          req.uploadedFiles.brandingLogo[0]
        ) {

          // If there's a new file, mark old file for deletion
          if (existingHost.brandingLogo) {
            oldFilesToDelete.push(existingHost.brandingLogo);
          }

          // Update with new file URL
          newBrandingLogo = req.uploadedFiles.brandingLogo[0].url;
        }

        if (req.uploadedFiles.coverImage && req.uploadedFiles.coverImage[0]) {
          // If there's a new file, mark old file for deletion
          if (existingHost.coverImage) {
            oldFilesToDelete.push(existingHost.coverImage);
          }

          // Update with new file URL
          newCoverImage = req.uploadedFiles.coverImage[0].url;
        }

        // // Process gallery images
        // if (req.uploadedFiles.gallery && req.uploadedFiles.gallery.length > 0) {
        //   console.log(`Updating gallery with ${req.uploadedFiles.gallery.length} new images`);

        //   // Mark old gallery images for deletion
        //   if (existingHost.gallery && existingHost.gallery.length > 0) {
        //     existingHost.gallery.forEach(imageUrl => {
        //       oldFilesToDelete.push(imageUrl);
        //     });
        //   }

        //   // Update with new gallery URLs
        //   newGallery = req.uploadedFiles.gallery.map(file => file.url);
        // }

      } 

      // Always preserve documents, branding images, and gallery (either updated with new files or keep existing)
      updateData.documents = newDocuments;
      updateData.brandingLogo = newBrandingLogo;
      updateData.coverImage = newCoverImage;
      updateData.gallery = newGallery;

      // Handle array fields - support both array and JSON string formats
      if (updateData.specialties) {
        if (Array.isArray(updateData.specialties)) {
          // Already an array, keep as is
          updateData.specialties = updateData.specialties;
        } else if (typeof updateData.specialties === "string") {
          // JSON string, parse it
          updateData.specialties = JSON.parse(updateData.specialties);
        }
      }

      if (updateData.achievements) {
        if (Array.isArray(updateData.achievements)) {
          updateData.achievements = updateData.achievements;
        } else if (typeof updateData.achievements === "string") {
          updateData.achievements = JSON.parse(updateData.achievements);
        }
      }

      if (
        updateData.socialMedia &&
        typeof updateData.socialMedia === "string"
      ) {
        updateData.socialMedia = JSON.parse(updateData.socialMedia);
      }

      // RazorpayX IDs commented out for now
      // Add updated RazorpayX IDs to updateData
      // updateData.contact_id = updatedContactId;
      // updateData.fund_account_id = updatedFundAccountId;

      // Update host
      const updatedHost = await Host.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      // Delete old files from S3 after successful update
      if (oldFilesToDelete.length > 0) {
        await deleteMultipleFromS3(oldFilesToDelete);
      }

      res.status(200).json({
        success: true,
        message: "Host updated successfully",
        data: updatedHost,
      });
    } catch (error) {
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      return next(new BadRequest(`Failed to upload files: ${error}`));
    }
  });
};

// Update host with file support (partial update - PATCH)
export const updateHostPartial = async (req, res, next) => {
  const { id } = req.params;

  // Define the fields that can contain files
  const fields = [
    { name: "panCard", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "bankPassbook", maxCount: 1 },
    { name: "businessLicense", maxCount: 1 },
    { name: "brandingLogo", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "gallery", maxCount: 10 }, // Allow up to 10 gallery images
  ];

  // Use S3 upload middleware
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      // Clean up any partially uploaded files
      await cleanupUploadedFiles(req);
      return next(new BadRequest(`Failed to upload files: ${err.message}`));
    }

    try {
      // Check if host exists after upload middleware so req.uploadedFiles is set
      const existingHost = await Host.findById(id);
      if (!existingHost) {
        await cleanupUploadedFiles(req);
        return next(new CustomError("Host not found", 404));
      }

      const updateData = { ...req.body };

      // Validate required fields that are being updated
      if ((updateData.hostName !== undefined && !updateData.hostName) ||
          (updateData.emailAddress !== undefined && !updateData.emailAddress) ||
          (updateData.phoneNumber !== undefined && !updateData.phoneNumber) ||
          (updateData.bankName !== undefined && !updateData.bankName) ||
          (updateData.accountHolderName !== undefined && !updateData.accountHolderName) ||
          (updateData.accountNumber !== undefined && !updateData.accountNumber) ||
          (updateData.ifscCode !== undefined && !updateData.ifscCode)) {
        // Clean up uploaded files if validation fails
        await cleanupUploadedFiles(req);
        return next(new BadRequest("hostName, emailAddress, phoneNumber, bankName, accountHolderName, accountNumber, ifscCode are required"));
      }

      // Remove fields that shouldn't be updated
      delete updateData.status;
      // delete updateData.isVerified;
      delete updateData.createdAt;

      // Check for duplicate email or PAN if they're being updated
      if (updateData.emailAddress || updateData.panNumber) {
        const duplicateCheck = await Host.findOne({
          $and: [
            { _id: { $ne: id } },
            {
              $or: [
                {
                  emailAddress:
                    updateData.emailAddress || existingHost.emailAddress,
                },
                { panNumber: updateData.panNumber || existingHost.panNumber },
              ],
            },
          ],
        });

        if (duplicateCheck) {
          // Clean up uploaded files if duplicate found
          await cleanupUploadedFiles(req);
          return next(
            new BadRequest("Host with this email or PAN number already exists")
          );
        }
      }

      // RazorpayX updates for PATCH commented out for now
      // Handle RazorpayX updates for PATCH
      // let updatedContactId = existingHost.contact_id;
      // let updatedFundAccountId = existingHost.fund_account_id;

      // // Check if contact details have changed (only if they're being updated)
      // const contactDetailsChanged = 
      //   (updateData.hostName !== undefined && updateData.hostName !== existingHost.hostName) ||
      //   (updateData.emailAddress !== undefined && updateData.emailAddress !== existingHost.emailAddress) ||
      //   (updateData.phoneNumber !== undefined && updateData.phoneNumber !== existingHost.phoneNumber);

      // if (contactDetailsChanged && existingHost.contact_id) {
      //   try {
      //     const contactData = {
      //       name: updateData.hostName !== undefined ? updateData.hostName : existingHost.hostName,
      //       email: updateData.emailAddress !== undefined ? updateData.emailAddress : existingHost.emailAddress,
      //       contact: updateData.phoneNumber !== undefined ? updateData.phoneNumber : existingHost.phoneNumber,
      //     };
          
      //     const updatedContact = await updateContactService(existingHost.contact_id, contactData);
      //     console.log("PATCH - Contact updated:", updatedContact);
      //     updatedContactId = updatedContact.id;
      //   } catch (error) {
      //     console.error("PATCH - RazorpayX contact update error:", error);
      //     // Clean up uploaded files if RazorpayX update fails
      //     await cleanupUploadedFiles(req);
      //     return next(error);
      //   }
      // }

      // // Check if bank details have changed (only if they're being updated)
      // const bankDetailsChanged = 
      //   (updateData.bankName !== undefined && updateData.bankName !== existingHost.bankName) ||
      //   (updateData.ifscCode !== undefined && updateData.ifscCode !== existingHost.ifscCode) ||
      //   (updateData.accountNumber !== undefined && updateData.accountNumber !== existingHost.accountNumber);

      // if (bankDetailsChanged) {
      //   try {
      //     const bankDetails = {
      //       name: updateData.bankName !== undefined ? updateData.bankName : existingHost.bankName,
      //       ifsc: updateData.ifscCode !== undefined ? updateData.ifscCode : existingHost.ifscCode,
      //       account_number: updateData.accountNumber !== undefined ? updateData.accountNumber : existingHost.accountNumber,
      //     };

      //     // Create new fund account (since fund accounts can't be updated)
      //     const newFundAccount = await createFundAccountService(updatedContactId, bankDetails);
      //     console.log("PATCH - New Fund Account created:", newFundAccount);
      //     updatedFundAccountId = newFundAccount.id;
      //   } catch (error) {
      //     console.error("PATCH - RazorpayX fund account creation error:", error);
      //     // Clean up uploaded files if RazorpayX update fails
      //     await cleanupUploadedFiles(req);
      //     return next(error);
      //   }
      // }

      // Handle file updates for PATCH
      const oldFilesToDelete = [];
      let documentsToUpdate = null;
      let galleryToUpdate = null;
      let brandingLogoToUpdate = null;
      let coverImageToUpdate = null;

      // Check if any files were uploaded
      const hasUploadedFiles =
        req.uploadedFiles && Object.keys(req.uploadedFiles).length > 0;

      if (hasUploadedFiles) {
        console.log("PATCH - Files uploaded:", Object.keys(req.uploadedFiles));

        // For PATCH, only update specific document fields that have new files
        const newDocuments = { ...existingHost.documents };
        const documentTypes = [
          "panCard",
          "gstCertificate",
          "bankPassbook",
          "businessLicense",
        ];

        documentTypes.forEach((docType) => {
          if (req.uploadedFiles[docType] && req.uploadedFiles[docType][0]) {
            console.log(
              `PATCH - Updating ${docType}: ${req.uploadedFiles[docType][0].url}`
            );

            // If there's a new file, mark old file for deletion
            if (existingHost.documents[docType]) {
              console.log(
                `PATCH - Marking old ${docType} for deletion: ${existingHost.documents[docType]}`
              );
              oldFilesToDelete.push(existingHost.documents[docType]);
            }

            // Update with new file URL
            newDocuments[docType] = req.uploadedFiles[docType][0].url;
          } else {
            console.log(
              `PATCH - Preserving existing ${docType}: ${
                existingHost.documents[docType] || "Not set"
              }`
            );
          }
        });

        // Process branding images for PATCH
        if (
          req.uploadedFiles.brandingLogo &&
          req.uploadedFiles.brandingLogo[0]
        ) {
          console.log(
            `PATCH - Updating brandingLogo: ${req.uploadedFiles.brandingLogo[0].url}`
          );

          // If there's a new file, mark old file for deletion
          if (existingHost.brandingLogo) {
            console.log(
              `PATCH - Marking old brandingLogo for deletion: ${existingHost.brandingLogo}`
            );
            oldFilesToDelete.push(existingHost.brandingLogo);
          }

          // Update with new file URL
          brandingLogoToUpdate = req.uploadedFiles.brandingLogo[0].url;
        }

        if (req.uploadedFiles.coverImage && req.uploadedFiles.coverImage[0]) {
          console.log(
            `PATCH - Updating coverImage: ${req.uploadedFiles.coverImage[0].url}`
          );

          // If there's a new file, mark old file for deletion
          if (existingHost.coverImage) {
            console.log(
              `PATCH - Marking old coverImage for deletion: ${existingHost.coverImage}`
            );
            oldFilesToDelete.push(existingHost.coverImage);
          }

          // Update with new file URL
          coverImageToUpdate = req.uploadedFiles.coverImage[0].url;
        }

        // Process gallery images for PATCH
        if (req.uploadedFiles.gallery && req.uploadedFiles.gallery.length > 0) {
          console.log(
            `PATCH - Updating gallery with ${req.uploadedFiles.gallery.length} new images`
          );

          // Mark old gallery images for deletion
          if (existingHost.gallery && existingHost.gallery.length > 0) {
            existingHost.gallery.forEach((imageUrl) => {
              oldFilesToDelete.push(imageUrl);
            });
          }

          // Update with new gallery URLs
          galleryToUpdate = req.uploadedFiles.gallery.map((file) => file.url);
        }

        console.log("PATCH - Files to delete from S3:", oldFilesToDelete);
        documentsToUpdate = newDocuments;
      } else {
        console.log(
          "PATCH - No files uploaded - documents and gallery fields will not be updated"
        );
      }

      // For PATCH, only update the fields that are provided
      const fieldsToUpdate = {};
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] !== undefined && updateData[key] !== null) {
          fieldsToUpdate[key] = updateData[key];
        }
      });

      // Add documents if any files were uploaded
      if (documentsToUpdate) {
        fieldsToUpdate.documents = documentsToUpdate;
      }

      // Add gallery if any files were uploaded
      if (galleryToUpdate) {
        fieldsToUpdate.gallery = galleryToUpdate;
      }

      // Add branding images if any files were uploaded
      if (brandingLogoToUpdate) {
        fieldsToUpdate.brandingLogo = brandingLogoToUpdate;
      }

      if (coverImageToUpdate) {
        fieldsToUpdate.coverImage = coverImageToUpdate;
      }

      // RazorpayX IDs commented out for now
      // Add updated RazorpayX IDs to fieldsToUpdate
      // fieldsToUpdate.contact_id = updatedContactId;
      // fieldsToUpdate.fund_account_id = updatedFundAccountId;

      // Handle array fields - support both array and JSON string formats
      if (fieldsToUpdate.specialties) {
        if (Array.isArray(fieldsToUpdate.specialties)) {
          // Already an array, keep as is
          fieldsToUpdate.specialties = fieldsToUpdate.specialties;
        } else if (typeof fieldsToUpdate.specialties === "string") {
          // JSON string, parse it
          fieldsToUpdate.specialties = JSON.parse(fieldsToUpdate.specialties);
        }
      }

      if (fieldsToUpdate.achievements) {
        if (Array.isArray(fieldsToUpdate.achievements)) {
          fieldsToUpdate.achievements = fieldsToUpdate.achievements;
        } else if (typeof fieldsToUpdate.achievements === "string") {
          fieldsToUpdate.achievements = JSON.parse(fieldsToUpdate.achievements);
        }
      }

      if (fieldsToUpdate.metaDescription) {
        if (Array.isArray(fieldsToUpdate.metaDescription)) {
          fieldsToUpdate.metaDescription = fieldsToUpdate.metaDescription;
        } else if (typeof fieldsToUpdate.metaDescription === "string") {
          fieldsToUpdate.metaDescription = JSON.parse(
            fieldsToUpdate.metaDescription
          );
        }
      }

      if (
        fieldsToUpdate.socialMedia &&
        typeof fieldsToUpdate.socialMedia === "string"
      ) {
        fieldsToUpdate.socialMedia = JSON.parse(fieldsToUpdate.socialMedia);
      }

      // Update host with only provided fields
      const updatedHost = await Host.findByIdAndUpdate(id, fieldsToUpdate, {
        new: true,
        runValidators: true,
      });

      // Delete old files from S3 after successful update
      if (oldFilesToDelete.length > 0) {
        await deleteMultipleFromS3(oldFilesToDelete);
      }

      res.status(200).json({
        success: true,
        message: "Host partially updated successfully",
        data: updatedHost,
      });
    } catch (error) {
      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);
      return next(new BadRequest(`Failed to upload files: ${error}`));
    }
  });
};

// Delete host and cleanup S3 files
export const deleteHost = async (req, res) => {
  const { id } = req.params;

  const host = await Host.findById(id);
  if (!host) {
    throw new CustomError("Host not found", 404);
  }

  // Collect all file URLs for deletion
  const filesToDelete = [];
  if (host.documents) {
    Object.values(host.documents).forEach((fileUrl) => {
      if (fileUrl) {
        filesToDelete.push(fileUrl);
      }
    });
  }

  // Add branding images to deletion list
  if (host.brandingLogo) {
    filesToDelete.push(host.brandingLogo);
  }
  if (host.coverImage) {
    filesToDelete.push(host.coverImage);
  }

  // Add gallery images to deletion list
  if (host.gallery && host.gallery.length > 0) {
    host.gallery.forEach((imageUrl) => {
      if (imageUrl) {
        filesToDelete.push(imageUrl);
      }
    });
  }

  // Delete host from database
  await Host.findByIdAndDelete(id);

  // Delete files from S3
  if (filesToDelete.length > 0) {
    await deleteMultipleFromS3(filesToDelete);
  }

  res.status(200).json({
    success: true,
    message: "Host and associated files deleted successfully",
  });
};

// Update host status (approve/reject)
export const updateHostStatus = async (req, res) => {
  const { id } = req.params;
  const { status, isVerified } = req.body;

  if (!["pending", "approved", "rejected"].includes(status)) {
    throw new BadRequest(
      "Invalid status. Must be pending, approved, or rejected"
    );
  }

  const host = await Host.findById(id);
  if (!host) {
    throw new CustomError("Host not found", 404);
  }

  const updateData = { status };
  if (isVerified !== undefined) {
    updateData.isVerified = isVerified;
  }

  const updatedHost = await Host.findByIdAndUpdate(id, updateData, {
    new: true,
  });

  res.status(200).json({
    success: true,
    message: `Host status updated to ${status}`,
    data: updatedHost,
  });
};

// Toggle host active status
export const toggleHostStatus = async (req, res) => {
  const { id } = req.params;

  const host = await Host.findById(id);
  if (!host) {
    throw new CustomError("Host not found", 404);
  }

  host.isActive = !host.isActive;
  await host.save();

  res.status(200).json({
    success: true,
    message: `Host ${host.isActive ? "activated" : "deactivated"} successfully`,
    data: host,
  });
};

// Get hosts by specialty - supports flexible specialty search
export const getHostsBySpecialty = async (req, res) => {
  const { specialty } = req.params;
  const { page = 1, limit = 10 } = req.query;

  // Use case-insensitive regex search to match specialty strings
  const filter = {
    specialties: { $regex: specialty, $options: "i" }, // Case-insensitive search
    status: "approved",
    isActive: true,
  };

  const hosts = await Host.find(filter)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

  const total = await Host.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: hosts,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
    },
  });
};

// Get hosts by location
export const getHostsByLocation = async (req, res) => {
  const { location } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const filter = {
    $or: [
      { city: { $regex: location, $options: "i" } },
      { state: { $regex: location, $options: "i" } },
      { location: { $regex: location, $options: "i" } },
    ],
    status: "approved",
    isActive: true,
  };

  const hosts = await Host.find(filter)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

  const total = await Host.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: hosts,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
    },
  });
};

// Add gallery images to existing host
export const addGalleryImages = async (req, res) => {
  const { id } = req.params;

  // Define the fields that can contain files
  const fields = [
    { name: "gallery", maxCount: 10 }, // Allow up to 10 gallery images
  ];

  // Use S3 upload middleware
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Failed to upload files: " + err.message });
    }

    try {
      // Check if host exists
      const existingHost = await Host.findById(id);
      if (!existingHost) {
        // Clean up uploaded files if host doesn't exist
        if (req.uploadedFiles) {
          const filesToDelete = [];
          Object.values(req.uploadedFiles)
            .flat()
            .forEach((file) => {
              filesToDelete.push(file.key);
            });
          await deleteMultipleFromS3(filesToDelete);
        }
        throw new CustomError("Host not found", 404);
      }

      let updatedGallery = existingHost.gallery || [];

      // Process new gallery images
      if (
        req.uploadedFiles &&
        req.uploadedFiles.gallery &&
        req.uploadedFiles.gallery.length > 0
      ) {
        const newImages = req.uploadedFiles.gallery.map((file) => file.url);
        updatedGallery = [...updatedGallery, ...newImages];

        console.log(`Added ${newImages.length} new images to gallery`);
      }

      // Update host with new gallery
      const updatedHost = await Host.findByIdAndUpdate(
        id,
        { gallery: updatedGallery },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: "Gallery images added successfully",
        data: updatedHost,
      });
    } catch (error) {
      // Clean up uploaded files if there's an error
      if (req.uploadedFiles) {
        const filesToDelete = [];
        Object.values(req.uploadedFiles)
          .flat()
          .forEach((file) => {
            filesToDelete.push(file.key);
          });
        await deleteMultipleFromS3(filesToDelete);
      }
      throw error;
    }
  });
};

// Update branding images
export const updateBrandingImages = async (req, res) => {
  const { id } = req.params;

  // Define the fields that can contain files
  const fields = [
    { name: "brandingLogo", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ];

  // Use S3 upload middleware
  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Failed to upload files: " + err.message });
    }

    try {
      // Check if host exists
      const existingHost = await Host.findById(id);
      if (!existingHost) {
        // Clean up uploaded files if host doesn't exist
        if (req.uploadedFiles) {
          const filesToDelete = [];
          Object.values(req.uploadedFiles)
            .flat()
            .forEach((file) => {
              filesToDelete.push(file.key);
            });
          await deleteMultipleFromS3(filesToDelete);
        }
        throw new CustomError("Host not found", 404);
      }

      const oldFilesToDelete = [];
      const updateData = {};

      // Process branding images
      if (req.uploadedFiles && Object.keys(req.uploadedFiles).length > 0) {
        if (
          req.uploadedFiles.brandingLogo &&
          req.uploadedFiles.brandingLogo[0]
        ) {
          console.log(
            `Updating brandingLogo: ${req.uploadedFiles.brandingLogo[0].url}`
          );

          // If there's a new file, mark old file for deletion
          if (existingHost.brandingLogo) {
            console.log(
              `Marking old brandingLogo for deletion: ${existingHost.brandingLogo}`
            );
            oldFilesToDelete.push(existingHost.brandingLogo);
          }

          // Update with new file URL
          updateData.brandingLogo = req.uploadedFiles.brandingLogo[0].url;
        }

        if (req.uploadedFiles.coverImage && req.uploadedFiles.coverImage[0]) {
          console.log(
            `Updating coverImage: ${req.uploadedFiles.coverImage[0].url}`
          );

          // If there's a new file, mark old file for deletion
          if (existingHost.coverImage) {
            console.log(
              `Marking old coverImage for deletion: ${existingHost.coverImage}`
            );
            oldFilesToDelete.push(existingHost.coverImage);
          }

          // Update with new file URL
          updateData.coverImage = req.uploadedFiles.coverImage[0].url;
        }
      }

      // Update host with new branding images
      const updatedHost = await Host.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      // Delete old files from S3 after successful update
      if (oldFilesToDelete.length > 0) {
        await deleteMultipleFromS3(oldFilesToDelete);
      }

      res.status(200).json({
        success: true,
        message: "Branding images updated successfully",
        data: updatedHost,
      });
    } catch (error) {
      // Clean up uploaded files if there's an error
      if (req.uploadedFiles) {
        const filesToDelete = [];
        Object.values(req.uploadedFiles)
          .flat()
          .forEach((file) => {
            filesToDelete.push(file.key);
          });
        await deleteMultipleFromS3(filesToDelete);
      }
      throw error;
    }
  });
};

// Remove specific gallery images
export const removeGalleryImages = async (req, res) => {
  const { id } = req.params;
  const { imageUrls } = req.body; // Array of image URLs to remove

  if (!imageUrls || !Array.isArray(imageUrls)) {
    throw new BadRequest("imageUrls array is required");
  }

  const host = await Host.findById(id);
  if (!host) {
    throw new CustomError("Host not found", 404);
  }

  const currentGallery = host.gallery || [];
  const updatedGallery = currentGallery.filter(
    (imageUrl) => !imageUrls.includes(imageUrl)
  );

  // Find images that were actually removed
  const removedImages = currentGallery.filter((imageUrl) =>
    imageUrls.includes(imageUrl)
  );

  if (removedImages.length === 0) {
    throw new BadRequest("No matching images found to remove");
  }

  // Update host
  const updatedHost = await Host.findByIdAndUpdate(
    id,
    { gallery: updatedGallery },
    { new: true }
  );

  // Delete removed images from S3
  await deleteMultipleFromS3(removedImages);

  res.status(200).json({
    success: true,
    message: `${removedImages.length} images removed from gallery`,
    data: updatedHost,
  });
};

// Get host statistics
export const getHostStats = async (req, res) => {
  const totalHosts = await Host.countDocuments();
  const pendingHosts = await Host.countDocuments({ status: "pending" });
  const approvedHosts = await Host.countDocuments({ status: "approved" });
  const rejectedHosts = await Host.countDocuments({ status: "rejected" });
  const activeHosts = await Host.countDocuments({ isActive: true });
  const verifiedHosts = await Host.countDocuments({ isVerified: true });

  // Get specialty distribution
  const specialtyStats = await Host.aggregate([
    { $unwind: "$specialties" },
    { $group: { _id: "$specialties", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Get location distribution
  const locationStats = await Host.aggregate([
    { $group: { _id: "$state", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      total: totalHosts,
      pending: pendingHosts,
      approved: approvedHosts,
      rejected: rejectedHosts,
      active: activeHosts,
      verified: verifiedHosts,
      specialtyDistribution: specialtyStats,
      locationDistribution: locationStats,
    },
  });
};

// delete one specific gallery image from host
export const deleteHostGalleryImage = async (req, res) => {
  try {
    const { _id, imageUrl } = req.body;

    if (!_id) {
      return res.status(400).json({ error: "Host ID is required" });
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    // Find the host
    const host = await Host.findById(_id);

    if (!host) {
      return res.status(404).json({ error: "Host not found" });
    }

    // Get current gallery images
    const currentImages = host.gallery || [];

    // Check if image exists
    if (!currentImages.includes(imageUrl)) {
      return res.status(404).json({ error: "Image not found in host gallery" });
    }

    // Filter out the image to be deleted
    const updatedImages = currentImages.filter((url) => url !== imageUrl);

    // Update the host with filtered images
    const updatedHost = await Host.findByIdAndUpdate(
      _id,
      { gallery: updatedImages },
      { new: true }
    );

    // Delete the specified image from S3
    await deleteMultipleFromS3([imageUrl]);

    return res.status(200).json({
      message: "Image deleted successfully",
      data: updatedHost,
      deletedImage: imageUrl,
    });
  } catch (error) {
    console.error("Error deleting host image:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// upload one new gallery image to existing host
export const uploadHostGalleryImage = async (req, res) => {
  const fields = [{ name: "gallery", maxCount: 1 }];

  uploadFilesToS3(fields)(req, res, async (err) => {
    if (err) {
      await cleanupUploadedFiles(req);
      return res.status(500).json({ error: "Failed to upload file" });
    }

    try {
      const { _id } = req.body;
      
      if (!_id) {
        await cleanupUploadedFiles(req);
        return res.status(400).json({ error: "Host ID is required" });
      }

      // Find the host
      const host = await Host.findById(_id);

      if (!host) {
        await cleanupUploadedFiles(req);
        return res.status(404).json({ error: "Host not found" });
      }

      const updates = {};

      // Process uploaded gallery image
      if (
        req?.uploadedFiles?.gallery &&
        req?.uploadedFiles?.gallery?.length > 0
      ) {
        const newImage = req.uploadedFiles.gallery[0].url;
        const existingImages = host.gallery || [];
        updates.gallery = [...existingImages, newImage];
      }

      // Update the host
      const updatedHost = await Host.findByIdAndUpdate(
        _id,
        { $set: updates },
        { new: true }
      );

      return res.status(200).json({
        message: "Image uploaded successfully",
        data: updatedHost,
      });
    } catch (error) {
      console.error("Error uploading host image:", error);

      // Clean up uploaded files if there's an error
      await cleanupUploadedFiles(req);

      return res.status(500).json({ error: "Internal server error" });
    }
  });
};

// Get all trips hosted by a specific host
export const getTripsByHost = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: "Host ID is required" });
    }

    // Optional pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5000;
    const skip = (page - 1) * limit;

    // Find all trips hosted by the specific host
    const trips = await Trips.find({ host: id })
      .populate('host')
      .limit(limit)
      .skip(skip)
      .sort({ date: -1 });

    // Get the total count of trips for this host
    const totalTrips = await Trips.countDocuments({ host: id });

    // Get host details for additional info
    const host = await Host.findById(id);

    if (!host) {
      return res.status(404).json({ error: "Host not found" });
    }

    return res.status(200).json({
      message: "Trips retrieved successfully",
      data: trips,
      hostInfo: {
        _id: host._id,
        hostName: host.hostName,
        location: host.location,
        city: host.city,
        state: host.state
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTrips / limit),
        totalTrips,
        hasNextPage: page < Math.ceil(totalTrips / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error("Error retrieving trips by host:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

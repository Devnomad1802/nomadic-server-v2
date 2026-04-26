// ================================
// PARTIAL DOCUMENT UPDATE EXAMPLES
// ================================
// NOTE: All documents are REQUIRED during host creation
// PAN Card, GST Certificate, Bank Passbook, and Business License are mandatory

// Initial Host Data (after creation - all documents required)
const initialHost = {
  _id: "674a1b2c3d4e5f6789012345",
  hostName: "John Doe",
  emailAddress: "john@example.com",
  documents: {
    panCard: "https://bucket.s3.region.amazonaws.com/hosts/panCard/original_pan.pdf",        // ✅ REQUIRED
    gstCertificate: "https://bucket.s3.region.amazonaws.com/hosts/gstCertificate/original_gst.pdf",  // ✅ REQUIRED
    bankPassbook: "https://bucket.s3.region.amazonaws.com/hosts/bankPassbook/original_bank.pdf",    // ✅ REQUIRED
    businessLicense: "https://bucket.s3.region.amazonaws.com/hosts/businessLicense/original_license.pdf" // ✅ REQUIRED
  }
};

// ================================
// SCENARIO 1: Update only PAN Card
// ================================
const updateOnlyPanCard = () => {
  const formData = new FormData();
  formData.append('hostName', 'John Doe Updated'); // Text field
  formData.append('panCard', newPanCardFile); // Only PAN card file
  
  // PUT /api/hosts/674a1b2c3d4e5f6789012345
  // RESULT:
  return {
    hostName: "John Doe Updated", // ✅ Updated
    documents: {
      panCard: "https://bucket.s3.region.amazonaws.com/hosts/panCard/new_pan_12345.pdf", // ✅ NEW
      gstCertificate: "https://bucket.s3.region.amazonaws.com/hosts/gstCertificate/original_gst.pdf", // ✅ PRESERVED
      bankPassbook: "https://bucket.s3.region.amazonaws.com/hosts/bankPassbook/original_bank.pdf", // ✅ PRESERVED
      businessLicense: "https://bucket.s3.region.amazonaws.com/hosts/businessLicense/original_license.pdf" // ✅ PRESERVED
    }
  };
  // S3 ACTIONS:
  // ➕ Upload: new_pan_12345.pdf
  // 🗑️ Delete: original_pan.pdf
};

// ================================
// SCENARIO 2: Update PAN + GST only
// ================================
const updatePanAndGst = () => {
  const formData = new FormData();
  formData.append('phoneNumber', '+91-9876543210'); // Text field
  formData.append('panCard', newPanCardFile); // New PAN
  formData.append('gstCertificate', newGstFile); // New GST
  
  // PUT /api/hosts/674a1b2c3d4e5f6789012345
  // RESULT:
  return {
    phoneNumber: "+91-9876543210", // ✅ Updated
    documents: {
      panCard: "https://bucket.s3.region.amazonaws.com/hosts/panCard/new_pan_67890.pdf", // ✅ NEW
      gstCertificate: "https://bucket.s3.region.amazonaws.com/hosts/gstCertificate/new_gst_67890.pdf", // ✅ NEW
      bankPassbook: "https://bucket.s3.region.amazonaws.com/hosts/bankPassbook/original_bank.pdf", // ✅ PRESERVED
      businessLicense: "https://bucket.s3.region.amazonaws.com/hosts/businessLicense/original_license.pdf" // ✅ PRESERVED
    }
  };
  // S3 ACTIONS:
  // ➕ Upload: new_pan_67890.pdf, new_gst_67890.pdf
  // 🗑️ Delete: original_pan.pdf, original_gst.pdf
};

// ================================
// SCENARIO 3: Update only text fields (no files)
// ================================
const updateOnlyTextFields = () => {
  const formData = new FormData();
  formData.append('hostName', 'John Smith'); // Text field
  formData.append('city', 'Mumbai'); // Text field
  formData.append('commissionRate', '20'); // Number field
  // No files uploaded
  
  // PUT /api/hosts/674a1b2c3d4e5f6789012345
  // RESULT:
  return {
    hostName: "John Smith", // ✅ Updated
    city: "Mumbai", // ✅ Updated
    commissionRate: 20, // ✅ Updated
    documents: {
      panCard: "https://bucket.s3.region.amazonaws.com/hosts/panCard/original_pan.pdf", // ✅ PRESERVED
      gstCertificate: "https://bucket.s3.region.amazonaws.com/hosts/gstCertificate/original_gst.pdf", // ✅ PRESERVED
      bankPassbook: "https://bucket.s3.region.amazonaws.com/hosts/bankPassbook/original_bank.pdf", // ✅ PRESERVED
      businessLicense: "https://bucket.s3.region.amazonaws.com/hosts/businessLicense/original_license.pdf" // ✅ PRESERVED
    }
  };
  // S3 ACTIONS:
  // ➕ Upload: None
  // 🗑️ Delete: None
};

// ================================
// SCENARIO 4: PATCH - Update only Bank Passbook
// ================================
const patchUpdateBankOnly = () => {
  const formData = new FormData();
  formData.append('bankPassbook', newBankFile); // Only bank passbook
  
  // PATCH /api/hosts/674a1b2c3d4e5f6789012345
  // RESULT: Only documents field updated, all other fields unchanged
  return {
    // All existing fields remain the same
    documents: {
      panCard: "https://bucket.s3.region.amazonaws.com/hosts/panCard/original_pan.pdf", // ✅ PRESERVED
      gstCertificate: "https://bucket.s3.region.amazonaws.com/hosts/gstCertificate/original_gst.pdf", // ✅ PRESERVED
      bankPassbook: "https://bucket.s3.region.amazonaws.com/hosts/bankPassbook/new_bank_11111.pdf", // ✅ NEW
      businessLicense: "https://bucket.s3.region.amazonaws.com/hosts/businessLicense/original_license.pdf" // ✅ PRESERVED
    }
  };
  // S3 ACTIONS:
  // ➕ Upload: new_bank_11111.pdf
  // 🗑️ Delete: original_bank.pdf
};

// ================================
// CONSOLE OUTPUT EXAMPLES
// ================================

// When updating only PAN card:
// Files uploaded: ['panCard']
// Updating panCard: https://bucket.s3.region.amazonaws.com/hosts/panCard/new_pan_12345.pdf
// Marking old panCard for deletion: https://bucket.s3.region.amazonaws.com/hosts/panCard/original_pan.pdf
// Preserving existing gstCertificate: https://bucket.s3.region.amazonaws.com/hosts/gstCertificate/original_gst.pdf
// Preserving existing bankPassbook: https://bucket.s3.region.amazonaws.com/hosts/bankPassbook/original_bank.pdf
// Preserving existing businessLicense: https://bucket.s3.region.amazonaws.com/hosts/businessLicense/original_license.pdf
// Files to delete from S3: ['https://bucket.s3.region.amazonaws.com/hosts/panCard/original_pan.pdf']

// When updating only text fields:
// No files uploaded - preserving all existing documents

// ================================
// ERROR HANDLING EXAMPLES
// ================================

const errorHandlingExample = () => {
  // If error occurs during update (e.g., duplicate email):
  // 1. New files uploaded to S3: new_pan_12345.pdf, new_gst_12345.pdf
  // 2. Error detected: "Host with this email already exists"
  // 3. Cleanup: Delete new_pan_12345.pdf, new_gst_12345.pdf from S3
  // 4. Old files remain untouched
  // 5. Database unchanged
};

// ================================
// VALIDATION ERROR EXAMPLES
// ================================

const missingDocumentExamples = () => {
  // SCENARIO 1: Missing PAN Card during creation
  const formDataMissingPAN = new FormData();
  formDataMissingPAN.append('hostName', 'John Doe');
  formDataMissingPAN.append('emailAddress', 'john@example.com');
  // formDataMissingPAN.append('panCard', panCardFile); // ❌ MISSING
  formDataMissingPAN.append('gstCertificate', gstFile);
  formDataMissingPAN.append('bankPassbook', bankFile);
  formDataMissingPAN.append('businessLicense', licenseFile);
  
  // POST /api/hosts/
  // RESULT: ❌ Error 400: "PAN Card document is required"
  // All uploaded files will be cleaned up from S3

  // SCENARIO 2: Missing GST Certificate during creation
  const formDataMissingGST = new FormData();
  formDataMissingGST.append('hostName', 'John Doe');
  formDataMissingGST.append('emailAddress', 'john@example.com');
  formDataMissingGST.append('panCard', panCardFile);
  // formDataMissingGST.append('gstCertificate', gstFile); // ❌ MISSING
  formDataMissingGST.append('bankPassbook', bankFile);
  formDataMissingGST.append('businessLicense', licenseFile);
  
  // POST /api/hosts/
  // RESULT: ❌ Error 400: "GST Certificate document is required"
  // All uploaded files will be cleaned up from S3

  // SCENARIO 3: Missing Bank Passbook during creation
  const formDataMissingBank = new FormData();
  formDataMissingBank.append('hostName', 'John Doe');
  formDataMissingBank.append('emailAddress', 'john@example.com');
  formDataMissingBank.append('panCard', panCardFile);
  formDataMissingBank.append('gstCertificate', gstFile);
  // formDataMissingBank.append('bankPassbook', bankFile); // ❌ MISSING
  formDataMissingBank.append('businessLicense', licenseFile);
  
  // POST /api/hosts/
  // RESULT: ❌ Error 400: "Bank Passbook document is required"
  // All uploaded files will be cleaned up from S3

  // SCENARIO 4: Missing Business License during creation
  const formDataMissingLicense = new FormData();
  formDataMissingLicense.append('hostName', 'John Doe');
  formDataMissingLicense.append('emailAddress', 'john@example.com');
  formDataMissingLicense.append('panCard', panCardFile);
  formDataMissingLicense.append('gstCertificate', gstFile);
  formDataMissingLicense.append('bankPassbook', bankFile);
  // formDataMissingLicense.append('businessLicense', licenseFile); // ❌ MISSING
  
  // POST /api/hosts/
  // RESULT: ❌ Error 400: "Business License document is required"
  // All uploaded files will be cleaned up from S3
};

export {
  updateOnlyPanCard,
  updatePanAndGst,
  updateOnlyTextFields,
  patchUpdateBankOnly,
  errorHandlingExample,
  missingDocumentExamples
};

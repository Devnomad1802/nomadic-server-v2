// ================================
// SPECIALTIES ARRAY HANDLING EXAMPLES
// ================================
// The specialties field supports both array and JSON string formats

// ================================
// SCENARIO 1: Direct Array (JavaScript/JSON API)
// ================================
const createHostWithArraySpecialties = () => {
  const requestBody = {
    hostName: "Adventure Plus",
    emailAddress: "info@adventureplus.com",
    panNumber: "ABCDE1234F",
    // Direct array format
    specialties: [
      "Mountain Climbing",
      "River Rafting", 
      "Wildlife Photography",
      "Eco Tourism"
    ],
    socialMedia: {
      facebook: "https://facebook.com/adventureplus",
      instagram: "https://instagram.com/adventureplus"
    }
    // + required documents as files
  };

  // POST /api/hosts/
  // Result: ✅ specialties stored as array directly
  return {
    specialties: [
      "Mountain Climbing",
      "River Rafting", 
      "Wildlife Photography",
      "Eco Tourism"
    ]
  };
};

// ================================
// SCENARIO 2: JSON String (FormData/Multipart)
// ================================
const createHostWithStringSpecialties = () => {
  const formData = new FormData();
  formData.append('hostName', 'Adventure Plus');
  formData.append('emailAddress', 'info@adventureplus.com');
  formData.append('panNumber', 'ABCDE1234F');
  
  // JSON string format (common with FormData)
  const specialtiesArray = [
    "Mountain Climbing",
    "River Rafting", 
    "Wildlife Photography",
    "Eco Tourism"
  ];
  formData.append('specialties', JSON.stringify(specialtiesArray));
  
  const socialMediaObj = {
    facebook: "https://facebook.com/adventureplus",
    instagram: "https://instagram.com/adventureplus"
  };
  formData.append('socialMedia', JSON.stringify(socialMediaObj));
  
  // + required document files
  formData.append('panCard', panCardFile);
  formData.append('gstCertificate', gstFile);
  formData.append('bankPassbook', bankFile);
  formData.append('businessLicense', licenseFile);

  // POST /api/hosts/
  // Result: ✅ JSON string parsed to array automatically
  return {
    specialties: [
      "Mountain Climbing",
      "River Rafting", 
      "Wildlife Photography",
      "Eco Tourism"
    ]
  };
};

// ================================
// SCENARIO 3: Update with Array Format
// ================================
const updateHostArraySpecialties = () => {
  // JSON API request
  const requestBody = {
    hostName: "Updated Adventure Plus",
    specialties: [
      "Luxury Mountain Expeditions",
      "Corporate Team Building",
      "Sustainable Tourism"
    ]
  };

  // PUT /api/hosts/:id
  // Result: ✅ Array handled directly
  return {
    hostName: "Updated Adventure Plus",
    specialties: [
      "Luxury Mountain Expeditions",
      "Corporate Team Building", 
      "Sustainable Tourism"
    ]
  };
};

// ================================
// SCENARIO 4: Update with JSON String Format
// ================================
const updateHostStringSpecialties = () => {
  const formData = new FormData();
  formData.append('hostName', 'Updated Adventure Plus');
  
  // JSON string format
  const newSpecialties = [
    "Luxury Mountain Expeditions",
    "Corporate Team Building",
    "Sustainable Tourism"
  ];
  formData.append('specialties', JSON.stringify(newSpecialties));

  // PUT /api/hosts/:id
  // Result: ✅ JSON string parsed to array
  return {
    hostName: "Updated Adventure Plus",
    specialties: [
      "Luxury Mountain Expeditions",
      "Corporate Team Building",
      "Sustainable Tourism"
    ]
  };
};


// ================================
// SCENARIO 5: PATCH Update - Partial Specialties
// ================================
const patchUpdateSpecialties = () => {
  // Only update specialties, keep other fields unchanged
  const requestBody = {
    specialties: [
      "Virtual Reality Tours",
      "Space Tourism Preparation",
      "Underwater Expeditions"
    ]
  };

  // PATCH /api/hosts/:id
  // Result: ✅ Only specialties updated, other fields preserved
  return {
    // All other fields remain the same
    specialties: [
      "Virtual Reality Tours",
      "Space Tourism Preparation", 
      "Underwater Expeditions"
    ]
  };
};

// ================================
// SCENARIO 6: Empty Specialties Handling
// ================================
const handleEmptySpecialties = () => {
  // Case 1: Empty array
  const emptyArrayCase = {
    hostName: "Basic Host",
    specialties: []
  };

  // Case 2: No specialties field
  const noSpecialtiesCase = {
    hostName: "Basic Host"
    // specialties field not provided
  };

  // Case 3: Empty string
  const emptyStringCase = {
    hostName: "Basic Host", 
    specialties: "[]" // Empty JSON array string
  };

  // All cases result in: specialties: []
  return {
    case1: { specialties: [] },
    case2: { specialties: [] },
    case3: { specialties: [] }
  };
};

// ================================
// CONTROLLER LOGIC EXPLANATION
// ================================
const controllerLogicExplanation = () => {
  // CREATE HOST LOGIC:
  // specialties: Array.isArray(specialties) ? specialties : (specialties ? JSON.parse(specialties) : [])
  
  const examples = [
    {
      input: ["Adventure", "Tourism"],
      isArray: true,
      result: ["Adventure", "Tourism"],
      explanation: "Direct array - used as is"
    },
    {
      input: '["Adventure", "Tourism"]',
      isArray: false,
      hasValue: true,
      result: ["Adventure", "Tourism"],
      explanation: "JSON string - parsed to array"
    },
    {
      input: null,
      isArray: false,
      hasValue: false,
      result: [],
      explanation: "No value - defaults to empty array"
    },
    {
      input: undefined,
      isArray: false,
      hasValue: false,
      result: [],
      explanation: "Undefined - defaults to empty array"
    }
  ];

  return examples;
};

// ================================
// SEARCH FUNCTIONALITY WITH ARRAYS
// ================================
const searchSpecialtiesExamples = () => {
  // Database contains hosts with these specialties:
  const hostData = [
    {
      hostName: "Mountain Adventures",
      specialties: ["Mountain Climbing", "Rock Climbing", "Adventure Trekking"]
    },
    {
      hostName: "Water Sports",
      specialties: ["River Rafting", "Scuba Diving", "Kayaking"]
    },
    {
      hostName: "Photography Tours",
      specialties: ["Wildlife Photography", "Landscape Photography", "Portrait Sessions"]
    }
  ];

  // Search examples:
  const searchResults = [
    {
      query: "GET /api/hosts/specialty/mountain",
      matches: ["Mountain Adventures"], // Matches "Mountain Climbing"
      explanation: "Case-insensitive partial match in specialties array"
    },
    {
      query: "GET /api/hosts/specialty/climbing",
      matches: ["Mountain Adventures"], // Matches both "Mountain Climbing" and "Rock Climbing"
      explanation: "Finds hosts with any specialty containing 'climbing'"
    },
    {
      query: "GET /api/hosts?search=photo",
      matches: ["Photography Tours"], // Matches specialties array
      explanation: "General search includes specialties field"
    },
    {
      query: "GET /api/hosts?search=adventure",
      matches: ["Mountain Adventures"], // Matches "Adventure Trekking"
      explanation: "Flexible search across all specialties"
    }
  ];

  return { hostData, searchResults };
};

// ================================
// ERROR HANDLING EXAMPLES
// ================================
const errorHandlingExamples = () => {
  const errorCases = [
    {
      input: "invalid json string",
      error: "JSON parsing error",
      handling: "Should validate JSON before parsing"
    },
    {
      input: '{"not": "array"}',
      error: "Parsed result is not an array",
      handling: "Should validate that parsed result is array"
    },
    {
      input: ["", null, undefined],
      error: "Array contains invalid values",
      handling: "Should filter out empty/null values"
    }
  ];

  return errorCases;
};

export {
  createHostWithArraySpecialties,
  createHostWithStringSpecialties,
  updateHostArraySpecialties,
  updateHostStringSpecialties,
  patchUpdateSpecialties,
  handleEmptySpecialties,
  controllerLogicExplanation,
  searchSpecialtiesExamples,
  errorHandlingExamples
};

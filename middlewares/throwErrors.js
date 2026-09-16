export class BadRequest extends Error {
  constructor(message = "Bad Request") {
    super(message);

    this.status = 400;
  }
}

export class Unauthorized extends Error {
  constructor(message = "Unauthorized") {
    super(message);

    this.status = 401;
  }
}

export class CustomError extends Error{
  constructor(message,status){
    super(message)
    this.status=status
  }
}

/**
 * ValidationError — carries per-field, human-readable messages so the frontend
 * can highlight the exact fields. `fields` maps a form field name to its
 * message, e.g. { panNumber: "Enter a valid PAN number." }.
 */
export class ValidationError extends Error {
  constructor(fields = {}, message = "Please fix the highlighted fields.") {
    super(message);
    this.status = 400;
    this.type = "VALIDATION_ERROR";
    this.fields = fields;
  }
}
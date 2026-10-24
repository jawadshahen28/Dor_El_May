export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    Object.assign(this, { status, code, fields });
  }
}

export const success = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const failure = (res, status, code, message, fields) => res.status(status).json({
  success: false, error: { code, message, ...(fields ? { fields } : {}) },
});

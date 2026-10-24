import mongoose from 'mongoose';
import { REPORT_TYPES, REPORT_STATUSES, REPORT_DESCRIPTION_MAX, normalizeReportDescription } from '@door-el-may/shared/reports';

const reportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
  type: { type: String, enum: REPORT_TYPES.map((type) => type.value), required: true },
  description: { type: String, default: '', set: normalizeReportDescription, maxlength: REPORT_DESCRIPTION_MAX,
    validate: function (value) { return this.type !== 'water_problem' || Boolean(value); } },
  status: { type: String, enum: Object.keys(REPORT_STATUSES), default: 'new', required: true },
  // Request metadata for safe retries, never included in citizen responses.
  submissionId: { type: String, required: true, match: /^[a-f\d]{32}$/, select: false },
}, { timestamps: true });
reportSchema.index({ userId: 1, createdAt: -1, _id: -1 });
reportSchema.index({ userId: 1, submissionId: 1 }, { unique: true });
reportSchema.index({ status: 1 });
reportSchema.index({ createdAt: -1, _id: -1 });
export const CitizenReport = mongoose.model('CitizenReport', reportSchema);

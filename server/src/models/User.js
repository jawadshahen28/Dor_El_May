import mongoose from 'mongoose';
import { normalizePhone } from '@door-el-may/shared/phone';
import { normalizeName } from '@door-el-may/shared/validation';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, maxlength: 100, set: normalizeName },
  phone: { type: String, required: true, unique: true, validate: (value) => normalizePhone(value) === value },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: function () { return this.role === 'resident'; } },
  passwordHash: { type: String, required: true, select: false },
  phoneVerified: { type: Boolean, default: false },
  // Retain council_admin for compatibility; explicit local creation uses admin.
  role: { type: String, enum: ['resident', 'admin', 'council_admin'], default: 'resident', index: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
}, { timestamps: true, toJSON: { transform(_doc, ret) { delete ret.passwordHash; delete ret.__v; return ret; } } });

export const User = mongoose.model('User', userSchema);

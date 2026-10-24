import mongoose from 'mongoose';

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export const Zone = mongoose.model('Zone', zoneSchema);

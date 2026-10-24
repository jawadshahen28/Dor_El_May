import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  content: { type: String, required: true, trim: true, maxlength: 20000 },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', required: true },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

announcementSchema.index({ status: 1, publishedAt: -1, _id: -1 });
export const Announcement = mongoose.model('Announcement', announcementSchema);

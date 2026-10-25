import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  content: { type: String, required: true, trim: true, maxlength: 20000 },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', required: true },
  publishedAt: { type: Date, default: null },
  notificationEvents: { type: [new mongoose.Schema({ key: String, type: { type: String, enum: ['announcement_published'] }, occurredAt: Date }, { _id: false })], default: undefined, select: false },
}, { timestamps: true });

announcementSchema.index({ status: 1, publishedAt: -1, _id: -1 });
announcementSchema.index({ 'notificationEvents.occurredAt': 1 });
export const Announcement = mongoose.model('Announcement', announcementSchema);

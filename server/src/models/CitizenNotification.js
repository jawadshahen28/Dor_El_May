import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventKey: { type: String, required: true },
  type: { type: String, enum: ['schedule_published', 'pumping_started'], required: true },
  zoneName: { type: String, required: true, maxlength: 100 },
  scheduledDate: { type: String, required: true },
  occurredAt: { type: Date, required: true },
  readAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ userId: 1, eventKey: 1 }, { unique: true });
schema.index({ userId: 1, occurredAt: -1, _id: -1 });
schema.index({ userId: 1, readAt: 1 });
// History has no TTL. PushDelivery/PushEvent expiry must not delete the inbox.
export const CitizenNotification = mongoose.model('CitizenNotification', schema);

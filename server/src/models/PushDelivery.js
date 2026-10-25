import mongoose from 'mongoose';
const eventSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  campaignId: { type: String, required: true, index: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, enum: ['schedule_published', 'pumping_started', 'announcement_published'], required: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, default: null },
  occurredAt: { type: Date, required: true }, expiresAt: { type: Date, required: true },
  cursor: { type: mongoose.Schema.Types.ObjectId, default: null }, fanoutDone: { type: Boolean, default: false },
  purgeAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
const deliverySchema = new mongoose.Schema({
  campaignId: { type: String, required: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'PushEvent', required: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PushSubscription', required: true },
  binding: { type: String, required: true, select: false },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'retry', 'skipped', 'failed'], default: 'pending', required: true },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, required: true },
  leaseUntil: { type: Date, default: null }, leaseToken: { type: String, default: null, select: false },
  lastCode: { type: String, default: null }, sentAt: { type: Date, default: null },
  purgeAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
deliverySchema.index({ eventId: 1, subscriptionId: 1 }, { unique: true });
deliverySchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
const stateSchema = new mongoose.Schema({ _id: String, activatedAt: Date, leaseUntil: Date, leaseToken: String, pausedUntil: Date }, { versionKey: false });
export const PushEvent = mongoose.model('PushEvent', eventSchema);
export const PushDelivery = mongoose.model('PushDelivery', deliverySchema);
export const PushWorkerState = mongoose.model('PushWorkerState', stateSchema);

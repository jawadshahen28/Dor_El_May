import mongoose from 'mongoose';
import { isCalendarDate, isLocalTime } from '@door-el-may/shared/water-time';

const auditSchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'edited', 'published', 'pumping_started', 'completed', 'cancelled'], required: true },
  at: { type: Date, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: false });
// Durable event intents only. No dispatcher or outbound push is enabled.
const notificationEventSchema = new mongoose.Schema({
  key: { type: String, required: true },
  type: { type: String, enum: ['schedule_published', 'pumping_started'], required: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
  occurredAt: { type: Date, required: true },
}, { _id: false });

// Calendar date and optional wall-clock time in Asia/Hebron. Actual events use UTC instants.
const waterRoundSchema = new mongoose.Schema({
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
  scheduledDate: { type: String, required: true, validate: isCalendarDate },
  scheduledTime: { type: String, default: null, validate: (value) => value == null || isLocalTime(value) },
  status: { type: String, enum: ['scheduled', 'pumping', 'completed', 'cancelled'], default: 'scheduled', required: true },
  actualStartedAt: { type: Date, default: null },
  actualEndedAt: { type: Date, default: null },
  publishedAt: { type: Date, default: null },
  revision: { type: Number, default: 0, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actualStartedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actualEndedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  creationKey: { type: String, select: false },
  creationFingerprint: { type: String, select: false },
  audit: { type: [auditSchema], default: undefined, select: false },
  notificationEvents: { type: [notificationEventSchema], default: undefined, select: false },
}, { timestamps: true });

waterRoundSchema.index({ status: 1, scheduledDate: 1, scheduledTime: 1, publishedAt: 1 });
waterRoundSchema.index({ zoneId: 1, status: 1, scheduledDate: 1, scheduledTime: 1, publishedAt: 1 });
waterRoundSchema.index({ updatedAt: -1, publishedAt: 1 });
waterRoundSchema.index({ scheduledDate: 1, scheduledTime: 1, _id: 1 });
waterRoundSchema.index({ creationKey: 1 }, { unique: true, partialFilterExpression: { creationKey: { $type: 'string' } } });
waterRoundSchema.index({ 'notificationEvents.occurredAt': 1 });

export const WaterRound = mongoose.model('WaterRound', waterRoundSchema);

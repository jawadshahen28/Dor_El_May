import mongoose from 'mongoose';
import { isCalendarDate, isLocalTime } from '@door-el-may/shared/water-time';

// Calendar date and optional wall-clock time in Asia/Hebron. Actual events use UTC instants.
const waterRoundSchema = new mongoose.Schema({
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
  scheduledDate: { type: String, required: true, validate: isCalendarDate },
  scheduledTime: { type: String, default: null, validate: (value) => value == null || isLocalTime(value) },
  status: { type: String, enum: ['scheduled', 'pumping', 'completed', 'cancelled'], default: 'scheduled', required: true },
  actualStartedAt: { type: Date, default: null },
  actualEndedAt: { type: Date, default: null },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

waterRoundSchema.index({ status: 1, scheduledDate: 1, scheduledTime: 1, publishedAt: 1 });
waterRoundSchema.index({ zoneId: 1, status: 1, scheduledDate: 1, scheduledTime: 1, publishedAt: 1 });
waterRoundSchema.index({ updatedAt: -1, publishedAt: 1 });
waterRoundSchema.index({ scheduledDate: 1, scheduledTime: 1, _id: 1 });

export const WaterRound = mongoose.model('WaterRound', waterRoundSchema);

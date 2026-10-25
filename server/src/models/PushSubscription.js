import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  installationHash: { type: String, required: true, unique: true, select: false },
  endpointHash: { type: String, required: true, unique: true, select: false },
  encrypted: { type: String, required: true, select: false },
  sessionHash: { type: String, required: true, index: true, select: false },
  binding: { type: String, required: true, select: false },
  keyVersion: { type: String, required: true, select: false },
  consentAt: { type: Date, required: true },
  lastSeenAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true, required: true, index: true },
  revision: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
  purgeAt: { type: Date, default: null, expires: 0 },
}, { timestamps: true });
schema.index({ active: 1, consentAt: 1, _id: 1 });
export const PushSubscription = mongoose.model('PushSubscription', schema);

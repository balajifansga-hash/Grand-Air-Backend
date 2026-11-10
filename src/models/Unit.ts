import mongoose, { Schema, Document } from 'mongoose';
import { ProductCategory, UnitStatus } from '../types.js';

export interface IUnit extends Document {
  id: string;
  serialNumber: string;
  batchId: string;
  batchNumber: string;
  productId: string;
  productName: string;
  modelNumber: string;
  category: ProductCategory;
  manufacturingDate: string;
  plantLocation: string;
  inspectorName: string;
  qcPassed: boolean;
  qcStamp: string;
  status: UnitStatus;
  verificationCode: string;
  qrPayload: string;
  qrDataUrl?: string;
  specsSnapshot: {
    sweepMm: number;
    rpm: number;
    powerWatts: number;
    color: string;
    warrantyMonths: number;
  };
  warrantyExpiryDate: string;
  notes?: string;
  scannedCount: number;
  lastScannedAt?: string;
  warrantyRegistration?: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerUpiId?: string;
    redeemAmount?: number;
    redeemStatus?: string;
    customerCity?: string;
    dealerName?: string;
    invoiceNumber?: string;
    registeredAt: string;
  };
}

const UnitSchema = new Schema<IUnit>({
  id: { type: String, required: true, unique: true },
  serialNumber: { type: String, required: true, unique: true, index: true },
  batchId: { type: String, required: true },
  batchNumber: { type: String, required: true },
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  modelNumber: { type: String, required: true },
  category: { type: String, default: 'ceiling_fan' },
  manufacturingDate: { type: String, required: true },
  plantLocation: { type: String, default: 'Grand Air Main Plant #1 (Coimbatore)' },
  inspectorName: { type: String, default: 'K. Rajesh (Lead QC Auditor)' },
  qcPassed: { type: Boolean, default: true },
  qcStamp: { type: String, default: 'QC-PASSED-ISO9001' },
  status: { type: String, default: 'manufactured' },
  verificationCode: { type: String, required: true },
  qrPayload: { type: String, required: true },
  qrDataUrl: { type: String },
  specsSnapshot: {
    sweepMm: { type: Number, default: 1200 },
    rpm: { type: Number, default: 370 },
    powerWatts: { type: Number, default: 55 },
    color: { type: String, default: 'Glossy Rich Brown / Black' },
    warrantyMonths: { type: Number, default: 24 }
  },
  warrantyExpiryDate: { type: String, required: true },
  notes: { type: String },
  scannedCount: { type: Number, default: 0 },
  lastScannedAt: { type: String },
  warrantyRegistration: {
    customerName: String,
    customerPhone: String,
    customerEmail: String,
    customerUpiId: String,
    redeemAmount: { type: Number, default: 150 },
    redeemStatus: { type: String, default: 'Processing' },
    customerCity: String,
    dealerName: String,
    invoiceNumber: String,
    registeredAt: String
  }
}, { timestamps: true });

export const UnitModel = mongoose.model<IUnit>('Unit', UnitSchema);


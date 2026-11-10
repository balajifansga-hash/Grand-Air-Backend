import mongoose, { Schema, Document } from 'mongoose';
import { ProductCategory } from '../types.js';

export interface IBatch extends Document {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  quantity: number;
  plantLocation: string;
  assemblyLine: string;
  inspectorName: string;
  status: 'completed' | 'in_progress' | 'cancelled';
  serialRangeStart: string;
  serialRangeEnd: string;
  createdAt: string;
  unitIds: string[];
}

const BatchSchema = new Schema<IBatch>({
  id: { type: String, required: true, unique: true },
  batchNumber: { type: String, required: true, unique: true },
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  category: { type: String, default: 'ceiling_fan' },
  quantity: { type: Number, required: true },
  plantLocation: { type: String, default: 'Grand Air Main Plant #1 (Coimbatore)' },
  assemblyLine: { type: String, default: 'Line 1 - Active Air Ceiling Fan Assembly' },
  inspectorName: { type: String, default: 'K. Rajesh (Lead QC Auditor)' },
  status: { type: String, default: 'completed' },
  serialRangeStart: { type: String, required: true },
  serialRangeEnd: { type: String, required: true },
  unitIds: [{ type: String }]
}, { timestamps: true });

export const BatchModel = mongoose.model<IBatch>('Batch', BatchSchema);


import mongoose, { Schema, Document } from 'mongoose';
import { ProductSpecs, ProductCategory, ProductStatus } from '../types.js';

export interface IProduct extends Document {
  id: string;
  sku: string;
  modelNumber: string;
  name: string;
  category: ProductCategory;
  description: string;
  price: number;
  imageUrl: string;
  specs: ProductSpecs;
  status: ProductStatus;
  totalManufactured: number;
  inStock: number;
  createdAt: string;
  updatedAt: string;
}

const ProductSchema = new Schema<IProduct>({
  id: { type: String, required: true, unique: true },
  sku: { type: String, required: true, unique: true },
  modelNumber: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, required: true, default: 'ceiling_fan' },
  description: { type: String, default: '' },
  price: { type: Number, default: 2499 },
  imageUrl: { type: String, default: '/active-air-fan.jpg' },
  specs: {
    sweepMm: { type: Number, required: true, default: 1200 },
    bladeCount: { type: Number, default: 3 },
    motorType: { type: String, default: 'Heavy Duty 100% Copper Winding Motor' },
    rpm: { type: Number, default: 370 },
    powerWatts: { type: Number, default: 55 },
    airDeliveryCmm: { type: Number, default: 270 },
    voltage: { type: String, default: '220-240V, 50Hz' },
    color: { type: String, default: 'Glossy Rich Brown / Black' },
    hasRemote: { type: Boolean, default: false },
    warrantyMonths: { type: Number, default: 24 }
  },
  status: { type: String, default: 'active' },
  totalManufactured: { type: Number, default: 0 },
  inStock: { type: Number, default: 0 }
}, { timestamps: true });

export const ProductModel = mongoose.model<IProduct>('Product', ProductSchema);


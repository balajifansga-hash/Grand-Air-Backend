import QRCode from 'qrcode';
import mongoose from 'mongoose';
import { db } from '../data/db.js';
import { isDatabaseConnected } from '../config/db.js';
import { ProductModel } from '../models/Product.js';
import { BatchModel } from '../models/Batch.js';
import { UnitModel } from '../models/Unit.js';
import { ManufacturingBatch, ProductUnit, ProductCategory } from '../types.js';

function generateToken(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function getCategoryCode(cat: ProductCategory): string {
  switch (cat) {
    case 'ceiling_fan': return 'CF';
    case 'table_fan': return 'TF';
    case 'pedestal_fan': return 'PF';
    case 'exhaust_fan': return 'EF';
    default: return 'CF';
  }
}

export interface ManufactureParams {
  productId: string;
  quantity: number;
  plantLocation?: string;
  assemblyLine?: string;
  inspectorName?: string;
  notes?: string;
}

export async function manufactureProductBatch(params: ManufactureParams): Promise<{
  batch: ManufacturingBatch;
  units: ProductUnit[];
}> {
  let product: any = null;

  if (isDatabaseConnected()) {
    const filter = mongoose.isValidObjectId(params.productId)
      ? { $or: [{ id: params.productId }, { _id: params.productId }] }
      : { id: params.productId };
    product = await ProductModel.findOne(filter).lean();
  }
  if (!product) {
    product = db.getProductById(params.productId) || db.getProducts().find(p => p.id === params.productId) || db.getProducts()[0];
  }
  if (!product) {
    throw new Error(`Product not found.`);
  }

  const qty = Math.max(1, Math.min(params.quantity, 1000));
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const day = String(now.getDate()).padStart(2, '0');

  let batchSeq = db.getBatches().length + 1;
  if (isDatabaseConnected()) {
    const mongoBatchCount = await BatchModel.countDocuments();
    batchSeq = Math.max(batchSeq, mongoBatchCount + 1);
  }

  const batchNumber = `GA-B${yearMonth}${day}-${String(batchSeq).padStart(3, '0')}`;
  const batchId = `batch-${Date.now()}`;

  const catCode = getCategoryCode(product.category);
  const plantLocation = params.plantLocation || 'Grand Air Main Plant #1 (Coimbatore)';
  const assemblyLine = params.assemblyLine || 'Line 1 - Active Air Ceiling Fan Assembly';
  const inspectorName = params.inspectorName || 'K. Rajesh (Lead QC Auditor)';

  let catUnitsCount = db.getUnits().filter(u => u.category === product.category).length;
  if (isDatabaseConnected()) {
    const mongoUnitCount = await UnitModel.countDocuments({ category: product.category });
    catUnitsCount = Math.max(catUnitsCount, mongoUnitCount);
  }

  const newUnits: ProductUnit[] = [];
  const unitIds: string[] = [];

  for (let i = 1; i <= qty; i++) {
    const seq = catUnitsCount + i;
    const serialNumber = `GA-${catCode}-${yearMonth}-B${String(batchSeq).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
    const vcode = generateToken();
    const uId = `unit-${serialNumber}-${Date.now()}`;
    unitIds.push(uId);

    const qrPayload = JSON.stringify({
      org: 'Grand Air Electronics Pvt Ltd',
      brand: 'Grand Air',
      product: product.name,
      model: product.modelNumber,
      sn: serialNumber,
      size: `${product.specs.sweepMm}mm`,
      voltage: product.specs.voltage,
      power: `${product.specs.powerWatts}W`,
      rpm: `${product.specs.rpm} RPM`,
      airDelivery: `${product.specs.airDeliveryCmm} CMM`,
      batch: batchNumber,
      mfg: now.toISOString().split('T')[0],
      vcode,
      qc: 'QC-PASS-ISO9001',
      verifyUrl: `http://localhost:5173/?verify=${serialNumber}`
    });

    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const expiry = new Date(now);
    expiry.setMonth(expiry.getMonth() + (product.specs.warrantyMonths || 24));

    const unit: ProductUnit = {
      id: uId,
      serialNumber,
      batchId,
      batchNumber,
      productId: product.id,
      productName: product.name,
      modelNumber: product.modelNumber,
      category: product.category,
      manufacturingDate: now.toISOString(),
      plantLocation,
      inspectorName,
      qcPassed: true,
      qcStamp: 'QC-PASSED-ISO9001',
      status: 'manufactured',
      verificationCode: vcode,
      qrPayload,
      qrDataUrl,
      specsSnapshot: {
        sweepMm: product.specs.sweepMm,
        rpm: product.specs.rpm,
        powerWatts: product.specs.powerWatts,
        color: product.specs.color,
        warrantyMonths: product.specs.warrantyMonths
      },
      warrantyExpiryDate: expiry.toISOString(),
      notes: params.notes || `Batch ${batchNumber} production run`,
      scannedCount: 0
    };

    newUnits.push(unit);
  }

  const batch: ManufacturingBatch = {
    id: batchId,
    batchNumber,
    productId: product.id,
    productName: product.name,
    category: product.category,
    quantity: qty,
    plantLocation,
    assemblyLine,
    inspectorName,
    status: 'completed',
    serialRangeStart: newUnits[0].serialNumber,
    serialRangeEnd: newUnits[newUnits.length - 1].serialNumber,
    createdAt: now.toISOString(),
    unitIds
  };

  // If MongoDB is connected, save directly to cloud MongoDB collections
  if (isDatabaseConnected()) {
    try {
      await BatchModel.create(batch);
      await UnitModel.insertMany(newUnits);
      await ProductModel.updateOne(
        { id: product.id },
        { 
          $inc: { totalManufactured: qty, inStock: qty },
          $set: { updatedAt: now.toISOString() }
        }
      );
    } catch (err) {
      console.error('MongoDB batch save error:', err);
    }
  }

  // Also save to disk backup
  db.addBatch(batch);
  db.addUnits(newUnits);
  db.updateProduct(product.id, {
    totalManufactured: (product.totalManufactured || 0) + qty,
    inStock: (product.inStock || 0) + qty
  });

  return { batch, units: newUnits };
}

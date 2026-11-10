export type ProductCategory = 
  | 'ceiling_fan'
  | 'table_fan'
  | 'pedestal_fan'
  | 'exhaust_fan'
  | 'wall_fan'
  | 'industrial_fan';

export type ProductStatus = 'active' | 'draft' | 'discontinued';

export interface ProductSpecs {
  sweepMm: number;
  bladeCount: number;
  motorType: string;
  rpm: number;
  powerWatts: number;
  airDeliveryCmm: number;
  voltage: string;
  color: string;
  hasRemote: boolean;
  warrantyMonths: number;
}

export interface Product {
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

export type UnitStatus = 
  | 'manufactured' 
  | 'qc_passed' 
  | 'packaged' 
  | 'dispatched' 
  | 'sold' 
  | 'in_service';

export interface ProductUnit {
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
  qrDataUrl?: string; // Base64 PNG generated on server
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
}

export interface ManufacturingBatch {
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

export interface AnalyticsSummary {
  totalProducts: number;
  totalUnitsManufactured: number;
  totalBatches: number;
  activeWarrantyCount: number;
  qcPassRate: number;
  categoryBreakdown: Record<ProductCategory, number>;
}


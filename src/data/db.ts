import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Product, ProductUnit, ManufacturingBatch, AnalyticsSummary, ProductCategory } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DatabaseSchema {
  products: Product[];
  batches: ManufacturingBatch[];
  units: ProductUnit[];
  meta: {
    initializedAt: string;
    lastSavedAt: string;
    version: string;
  };
}

// Active Air Ceiling Fan specification variants from the manufacturer packaging
const ACTIVE_AIR_PRODUCTS: Product[] = [
  {
    id: 'prod-active-air-1200',
    sku: 'GA-CF-AA1200',
    modelNumber: 'Active Air 1200mm',
    name: 'Grand Air Active Air Ceiling Fan (1200mm / 48")',
    category: 'ceiling_fan',
    description: 'Active breeze fan with excellent performance. Premium 3-blade aerodynamic design with 270 CMM high air delivery.',
    price: 2499,
    imageUrl: '/active-air-fan.jpg',
    specs: {
      sweepMm: 1200,
      bladeCount: 3,
      motorType: 'Heavy Duty 100% Copper Winding Motor',
      rpm: 370,
      powerWatts: 55,
      airDeliveryCmm: 270,
      voltage: '220-240V, 50Hz',
      color: 'Glossy Rich Brown / Black',
      hasRemote: false,
      warrantyMonths: 24
    },
    status: 'active',
    totalManufactured: 5,
    inStock: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-active-air-900',
    sku: 'GA-CF-AA900',
    modelNumber: 'Active Air 900mm',
    name: 'Grand Air Active Air Ceiling Fan (900mm / 36")',
    category: 'ceiling_fan',
    description: 'Active breeze fan with compact sweep, engineered for bedrooms, cabins, and dining spaces. 170 CMM air delivery.',
    price: 2199,
    imageUrl: '/active-air-fan.jpg',
    specs: {
      sweepMm: 900,
      bladeCount: 3,
      motorType: 'High-Torque 100% Copper Winding Motor',
      rpm: 370,
      powerWatts: 55,
      airDeliveryCmm: 170,
      voltage: '220-240V, 50Hz',
      color: 'Glossy Rich Brown / Black',
      hasRemote: false,
      warrantyMonths: 24
    },
    status: 'active',
    totalManufactured: 0,
    inStock: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-active-air-600',
    sku: 'GA-CF-AA600',
    modelNumber: 'Active Air 600mm',
    name: 'Grand Air Active Air High-Speed Ceiling Fan (600mm / 24")',
    category: 'ceiling_fan',
    description: 'High-speed 850 RPM compact ceiling fan for kitchens, balconies, and shops. 125 CMM instant breeze.',
    price: 1899,
    imageUrl: '/active-air-fan.jpg',
    specs: {
      sweepMm: 600,
      bladeCount: 3,
      motorType: 'Ultra High-Speed Induction Motor',
      rpm: 850,
      powerWatts: 75,
      airDeliveryCmm: 125,
      voltage: '220-240V, 50Hz',
      color: 'Glossy Rich Brown / Black',
      hasRemote: false,
      warrantyMonths: 24
    },
    status: 'active',
    totalManufactured: 0,
    inStock: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectory();
    this.data = this.load();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  private load(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Guarantee products array is never empty
          if (!Array.isArray(parsed.products) || parsed.products.length === 0) {
            parsed.products = [...ACTIVE_AIR_PRODUCTS];
          }
          if (!Array.isArray(parsed.batches)) {
            parsed.batches = [];
          }
          if (!Array.isArray(parsed.units)) {
            parsed.units = [];
          }
          if (!parsed.meta) {
            parsed.meta = {
              initializedAt: new Date().toISOString(),
              lastSavedAt: new Date().toISOString(),
              version: '3.0.0'
            };
          }
          return parsed;
        }
      } catch (err) {
        console.error('Error loading database file, initializing defaults:', err);
      }
    }

    const initialData: DatabaseSchema = {
      products: [...ACTIVE_AIR_PRODUCTS],
      batches: [],
      units: [],
      meta: {
        initializedAt: new Date().toISOString(),
        lastSavedAt: new Date().toISOString(),
        version: '3.0.0'
      }
    };

    this.save(initialData);
    return initialData;
  }

  // Atomic file save with automatic backup rotation
  private save(data: DatabaseSchema): void {
    data.meta.lastSavedAt = new Date().toISOString();
    const content = JSON.stringify(data, null, 2);
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;

    try {
      // 1. Write to temporary file
      fs.writeFileSync(tempFile, content, 'utf-8');
      // 2. Atomic rename to target db.json
      fs.renameSync(tempFile, DB_FILE);

      // 3. Keep automated rolling backup (max 10 backups)
      const backupPath = path.join(BACKUP_DIR, `db-backup-${new Date().toISOString().split('T')[0]}.json`);
      fs.writeFileSync(backupPath, content, 'utf-8');
    } catch (err) {
      console.error('Error saving database:', err);
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    }
  }

  getDbFilePath(): string {
    return DB_FILE;
  }

  getProducts(): Product[] {
    return this.data.products;
  }

  getProductById(id: string): Product | undefined {
    return this.data.products.find(p => p.id === id);
  }

  addProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'totalManufactured' | 'inStock'>): Product {
    const newProduct: Product = {
      ...product,
      id: `prod-${Date.now()}`,
      totalManufactured: 0,
      inStock: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.products.unshift(newProduct);
    this.save(this.data);
    return newProduct;
  }

  updateProduct(id: string, updates: Partial<Product>): Product | null {
    const index = this.data.products.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.data.products[index] = {
      ...this.data.products[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save(this.data);
    return this.data.products[index];
  }

  deleteProduct(id: string): boolean {
    const initialLen = this.data.products.length;
    this.data.products = this.data.products.filter(p => p.id !== id);
    if (this.data.products.length !== initialLen) {
      this.save(this.data);
      return true;
    }
    return false;
  }

  getBatches(): ManufacturingBatch[] {
    return this.data.batches;
  }

  getBatchById(id: string): ManufacturingBatch | undefined {
    return this.data.batches.find(b => b.id === id);
  }

  addBatch(batch: ManufacturingBatch): void {
    this.data.batches.unshift(batch);
    this.save(this.data);
  }

  getUnits(): ProductUnit[] {
    return this.data.units;
  }

  getUnitBySerial(serial: string): ProductUnit | undefined {
    const clean = serial.trim().toUpperCase();
    return this.data.units.find(u => u.serialNumber.toUpperCase() === clean);
  }

  addUnits(newUnits: ProductUnit[]): void {
    this.data.units.unshift(...newUnits);
    this.save(this.data);
  }

  updateUnit(serialNumber: string, updates: Partial<ProductUnit>): ProductUnit | null {
    const index = this.data.units.findIndex(u => u.serialNumber.toUpperCase() === serialNumber.trim().toUpperCase());
    if (index === -1) return null;

    this.data.units[index] = {
      ...this.data.units[index],
      ...updates
    };
    this.save(this.data);
    return this.data.units[index];
  }

  incrementUnitScan(serialNumber: string): ProductUnit | null {
    const unit = this.getUnitBySerial(serialNumber);
    if (!unit) return null;
    return this.updateUnit(serialNumber, {
      scannedCount: (unit.scannedCount || 0) + 1,
      lastScannedAt: new Date().toISOString()
    });
  }

  getAnalytics(): AnalyticsSummary {
    const products = this.getProducts();
    const units = this.getUnits();
    const batches = this.getBatches();

    const categoryBreakdown: Record<ProductCategory, number> = {
      ceiling_fan: units.length,
      table_fan: 0,
      pedestal_fan: 0,
      exhaust_fan: 0,
      wall_fan: 0,
      industrial_fan: 0
    };

    const activeWarranty = units.filter(u => new Date(u.warrantyExpiryDate) > new Date()).length;
    const passedQc = units.filter(u => u.qcPassed).length;
    const qcPassRate = units.length > 0 ? Math.round((passedQc / units.length) * 100) : 100;

    return {
      totalProducts: products.length,
      totalUnitsManufactured: units.length,
      totalBatches: batches.length,
      activeWarrantyCount: activeWarranty,
      qcPassRate,
      categoryBreakdown
    };
  }

  clearAll(): void {
    // Keep products permanently, only reset counters to 0
    const currentProducts = this.data.products.length > 0 ? this.data.products : (ACTIVE_AIR_PRODUCTS as Product[]);
    this.data.products = currentProducts.map(p => ({
      ...p,
      totalManufactured: 0,
      inStock: 0
    }));
    this.data.batches = [];
    this.data.units = [];
    this.save(this.data);
  }
}

export const db = new Database();

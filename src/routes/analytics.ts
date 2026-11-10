import { Router, Request, Response } from 'express';
import { db } from '../data/db.js';
import { isDatabaseConnected } from '../config/db.js';
import { ProductModel } from '../models/Product.js';
import { BatchModel } from '../models/Batch.js';
import { UnitModel } from '../models/Unit.js';
import { ProductCategory } from '../types.js';

export const analyticsRouter = Router();

analyticsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    if (isDatabaseConnected()) {
      const [productsCount, batchesCount, units] = await Promise.all([
        ProductModel.countDocuments(),
        BatchModel.countDocuments(),
        UnitModel.find().lean()
      ]);

      const categoryBreakdown: Record<ProductCategory, number> = {
        ceiling_fan: units.length,
        table_fan: 0,
        pedestal_fan: 0,
        exhaust_fan: 0,
        wall_fan: 0,
        industrial_fan: 0
      };

      const now = new Date();
      const activeWarranty = units.filter(u => new Date(u.warrantyExpiryDate) > now).length;
      const passedQc = units.filter(u => u.qcPassed).length;
      const qcPassRate = units.length > 0 ? Math.round((passedQc / units.length) * 100) : 100;

      return res.json({
        success: true,
        data: {
          totalProducts: productsCount,
          totalUnitsManufactured: units.length,
          totalBatches: batchesCount,
          activeWarrantyCount: activeWarranty,
          qcPassRate,
          categoryBreakdown
        }
      });
    }

    const summary = db.getAnalytics();
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

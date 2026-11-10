import { Router, Request, Response } from 'express';
import { db } from '../data/db.js';
import { isDatabaseConnected } from '../config/db.js';
import { BatchModel } from '../models/Batch.js';
import { UnitModel } from '../models/Unit.js';
import { manufactureProductBatch } from '../services/manufacturing.js';

export const batchesRouter = Router();

// GET all batches
batchesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    if (isDatabaseConnected()) {
      const mongoBatches = await BatchModel.find().sort({ createdAt: -1 }).lean();
      return res.json({ success: true, count: mongoBatches.length, data: mongoBatches });
    }
    const batches = db.getBatches();
    res.json({ success: true, count: batches.length, data: batches });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single batch by ID
batchesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const batchId = String(req.params.id);

    if (isDatabaseConnected()) {
      const mongoBatch = await BatchModel.findOne({ id: batchId }).lean();
      if (mongoBatch) {
        const units = await UnitModel.find({ batchId: mongoBatch.id }).lean();
        return res.json({ success: true, data: { ...mongoBatch, units } });
      }
    }

    const batch = db.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    const allUnits = db.getUnits();
    const batchUnits = allUnits.filter(u => u.batchId === batch.id);

    res.json({ success: true, data: { ...batch, units: batchUnits } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST manufacture new batch of fans (e.g., 5 Ceiling Fans)
batchesRouter.post('/manufacture', async (req: Request, res: Response) => {
  try {
    const { productId, quantity, plantLocation, assemblyLine, inspectorName, notes } = req.body;
    if (!productId || !quantity) {
      return res.status(400).json({ success: false, message: 'productId and quantity are required' });
    }

    const result = await manufactureProductBatch({
      productId,
      quantity: Number(quantity),
      plantLocation,
      assemblyLine,
      inspectorName,
      notes
    });

    res.status(201).json({
      success: true,
      message: `Successfully manufactured ${result.units.length} units of ${result.batch.productName}`,
      data: result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

import { Router, Request, Response } from 'express';
import { db } from '../data/db.js';
import { isDatabaseConnected } from '../config/db.js';
import { UnitModel } from '../models/Unit.js';

export const verifyRouter = Router();

// Public authenticity verification endpoint
verifyRouter.get('/:serialNumber', async (req: Request, res: Response) => {
  try {
    const serialNumber = String(req.params.serialNumber).toUpperCase();
    let unit: any = null;

    if (isDatabaseConnected()) {
      try {
        unit = await UnitModel.findOneAndUpdate(
          { serialNumber },
          { 
            $inc: { scannedCount: 1 },
            $set: { lastScannedAt: new Date().toISOString() }
          },
          { new: true }
        ).lean();
      } catch (mongoErr: any) {
        console.warn('MongoDB verify error, falling back locally:', mongoErr.message);
      }
    }

    if (!unit) {
      unit = db.getUnitBySerial(serialNumber);
      if (unit) {
        unit = db.incrementUnitScan(serialNumber) || unit;
      }
    }

    if (!unit) {
      return res.status(404).json({
        success: false,
        genuine: false,
        message: `Serial number "${serialNumber}" is not registered in Grand Air official records.`
      });
    }

    const now = new Date();
    const expiry = new Date(unit.warrantyExpiryDate);
    const isWarrantyActive = expiry > now;
    const remainingDays = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    res.json({
      success: true,
      genuine: true,
      certificate: {
        organization: 'Grand Air Electronics Pvt Ltd',
        productName: unit.productName,
        modelNumber: unit.modelNumber,
        serialNumber: unit.serialNumber,
        verificationCode: unit.verificationCode,
        category: unit.category,
        batchNumber: unit.batchNumber,
        manufacturingDate: unit.manufacturingDate,
        plantLocation: unit.plantLocation,
        qcStamp: unit.qcStamp,
        qcPassed: unit.qcPassed,
        lifecycleStatus: unit.status,
        specs: unit.specsSnapshot,
        warranty: {
          active: isWarrantyActive,
          totalMonths: unit.specsSnapshot.warrantyMonths,
          expiryDate: unit.warrantyExpiryDate,
          remainingDays
        },
        verificationCount: unit.scannedCount,
        lastScannedAt: unit.lastScannedAt,
        warrantyRegistration: unit.warrantyRegistration
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

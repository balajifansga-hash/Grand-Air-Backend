import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { db } from '../data/db.js';
import { isDatabaseConnected } from '../config/db.js';
import { UnitModel } from '../models/Unit.js';
import { BatchModel } from '../models/Batch.js';
import { UnitStatus } from '../types.js';
import { emailService } from '../services/email.js';

export const unitsRouter = Router();

// GET all units with optional query filters
unitsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { batchId, productId, status, search } = req.query;

    if (isDatabaseConnected()) {
      try {
        const filter: any = {};
        if (batchId && typeof batchId === 'string') filter.batchId = batchId;
        if (productId && typeof productId === 'string') filter.productId = productId;
        if (status && typeof status === 'string') filter.status = status;
        if (search && typeof search === 'string') {
          const regex = new RegExp(search, 'i');
          filter.$or = [
            { serialNumber: regex },
            { productName: regex },
            { batchNumber: regex },
            { verificationCode: regex }
          ];
        }

        const mongoUnits = await UnitModel.find(filter).sort({ createdAt: -1 }).lean();
        if (mongoUnits && mongoUnits.length > 0) {
          return res.json({ success: true, count: mongoUnits.length, data: mongoUnits });
        }
      } catch (mongoErr: any) {
        console.warn('MongoDB units query warning, falling back to local file:', mongoErr.message);
      }
    }

    let units = db.getUnits();
    if (batchId && typeof batchId === 'string') units = units.filter(u => u.batchId === batchId);
    if (productId && typeof productId === 'string') units = units.filter(u => u.productId === productId);
    if (status && typeof status === 'string') units = units.filter(u => u.status === status);
    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      units = units.filter(u => 
        u.serialNumber.toLowerCase().includes(q) ||
        u.productName.toLowerCase().includes(q) ||
        u.batchNumber.toLowerCase().includes(q) ||
        u.verificationCode.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, count: units.length, data: units });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET units registered under a specific customer phone or email (Strict isolation between customers)
unitsRouter.get('/customer/:identifier', async (req: Request, res: Response) => {
  try {
    const rawId = String(req.params.identifier).trim().toLowerCase();
    let matchingUnits: any[] = [];

    if (isDatabaseConnected()) {
      try {
        matchingUnits = await UnitModel.find({
          $or: [
            { 'warrantyRegistration.customerPhone': rawId },
            { 'warrantyRegistration.customerEmail': rawId },
            { customerPhone: rawId },
            { customerEmail: rawId }
          ]
        }).sort({ createdAt: -1 }).lean();
      } catch (err: any) {
        console.warn('MongoDB customer units query warning:', err.message);
      }
    }

    if (!matchingUnits || matchingUnits.length === 0) {
      const allUnits = db.getUnits();
      matchingUnits = allUnits.filter(u => {
        const phone = (u.warrantyRegistration?.customerPhone || (u as any).customerPhone || '').toLowerCase();
        const email = (u.warrantyRegistration?.customerEmail || (u as any).customerEmail || '').toLowerCase();
        return phone === rawId || email === rawId;
      });
    }

    const certificates = matchingUnits.map(unit => {
      const now = new Date();
      const expiry = new Date(unit.warrantyExpiryDate);
      const isWarrantyActive = expiry > now;
      const remainingDays = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      return {
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
          totalMonths: unit.specsSnapshot?.warrantyMonths || 24,
          expiryDate: unit.warrantyExpiryDate,
          remainingDays
        },
        verificationCount: unit.scannedCount || 1,
        lastScannedAt: unit.lastScannedAt,
        warrantyRegistration: unit.warrantyRegistration
      };
    });

    res.json({
      success: true,
      count: certificates.length,
      data: certificates
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST sync units and batches from frontend/local storage
unitsRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const { units, batches, products } = req.body;
    if (Array.isArray(units) && units.length > 0) {
      for (const u of units) {
        if (!db.getUnitBySerial(u.serialNumber)) {
          db.addUnits([u]);
        }
        if (isDatabaseConnected()) {
          try {
            await UnitModel.updateOne(
              { serialNumber: u.serialNumber },
              { $setOnInsert: u },
              { upsert: true }
            );
          } catch (e) {}
        }
      }
    }
    if (Array.isArray(batches) && batches.length > 0) {
      for (const b of batches) {
        if (!db.getBatchById(b.id)) {
          db.addBatch(b);
        }
        if (isDatabaseConnected()) {
          try {
            await BatchModel.updateOne(
              { id: b.id },
              { $setOnInsert: b },
              { upsert: true }
            );
          } catch (e) {}
        }
      }
    }
    res.json({ 
      success: true, 
      message: 'Factory state synchronized successfully', 
      totalUnits: db.getUnits().length,
      totalBatches: db.getBatches().length 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single unit by serial number
unitsRouter.get('/:serialNumber', async (req: Request, res: Response) => {
  try {
    const serialNumber = String(req.params.serialNumber).toUpperCase();

    if (isDatabaseConnected()) {
      const mongoUnit = await UnitModel.findOne({ serialNumber }).lean();
      if (mongoUnit) {
        return res.json({ success: true, data: mongoUnit });
      }
    }

    const unit = db.getUnitBySerial(serialNumber);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found with specified serial number' });
    }
    res.json({ success: true, data: unit });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH update unit lifecycle status
unitsRouter.patch('/:serialNumber/status', async (req: Request, res: Response) => {
  try {
    const serialNumber = String(req.params.serialNumber).toUpperCase();
    const { status, notes } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    if (isDatabaseConnected()) {
      await UnitModel.updateOne(
        { serialNumber },
        { $set: { status, ...(notes ? { notes } : {}) } }
      );
    }

    const updated = db.updateUnit(serialNumber, {
      status: status as UnitStatus,
      ...(notes ? { notes } : {})
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    res.json({ success: true, message: 'Unit status updated successfully', data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST register customer warranty & send dual emails
unitsRouter.post('/:serialNumber/register-warranty', async (req: Request, res: Response) => {
  try {
    const serialNumber = String(req.params.serialNumber).toUpperCase();
    const { 
      customerName, 
      customerPhone, 
      customerEmail, 
      customerUpiId, 
      redeemAmount,
      customerCity, 
      dealerName, 
      invoiceNumber 
    } = req.body;

    if (!customerName || !customerPhone) {
      return res.status(400).json({ success: false, message: 'customerName and customerPhone are required' });
    }

    const registration = {
      customerName,
      customerPhone,
      customerEmail: customerEmail || '',
      customerUpiId: customerUpiId || '',
      redeemAmount: Number(redeemAmount) || 150,
      redeemStatus: 'Processing',
      customerCity: customerCity || 'Online Customer',
      dealerName: dealerName || 'Authorized Grand Air Dealer',
      invoiceNumber: invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
      registeredAt: new Date().toISOString()
    };

    let targetUnit: any = null;

    if (isDatabaseConnected()) {
      try {
        targetUnit = await UnitModel.findOneAndUpdate(
          { serialNumber },
          { 
            $set: { 
              status: 'sold',
              warrantyRegistration: registration
            } 
          },
          { new: true }
        ).lean();
      } catch (mongoErr: any) {
        console.warn('MongoDB warranty update warning, falling back locally:', mongoErr.message);
      }
    }

    if (!targetUnit) {
      targetUnit = db.updateUnit(serialNumber, {
        status: 'sold',
        warrantyRegistration: registration
      });
    }

    // Auto-create unit if not in database yet (e.g. freshly manufactured or from scanned QR)
    if (!targetUnit) {
      const defaultProduct = db.getProducts()[0];
      const now = new Date();
      const expiry = new Date(now);
      expiry.setFullYear(expiry.getFullYear() + 2);

      const newUnit: any = {
        id: `unit-${serialNumber}`,
        serialNumber,
        batchId: `batch-auto-${serialNumber.slice(-8)}`,
        batchNumber: serialNumber.includes('-B') ? `GA-B${serialNumber.split('-B')[1]?.split('-')[0] || '20261109-002'}` : 'GA-B20261109-002',
        productId: defaultProduct?.id || 'prod-active-air-1200',
        productName: defaultProduct?.name || 'Grand Air Active Air Ceiling Fan (1200mm / 48")',
        modelNumber: defaultProduct?.modelNumber || 'Active Air 1200mm',
        category: 'ceiling_fan',
        manufacturingDate: now.toISOString(),
        plantLocation: 'Grand Air Main Plant #1 (Coimbatore)',
        inspectorName: 'K. Rajesh (Lead QC Auditor)',
        qcPassed: true,
        qcStamp: 'QC-PASSED-ISO9001',
        status: 'sold',
        verificationCode: '8K92-M4P7',
        qrPayload: JSON.stringify({
          org: 'Grand Air Electronics Pvt Ltd',
          brand: 'Grand Air',
          product: defaultProduct?.name || 'Grand Air Active Air Ceiling Fan (1200mm / 48")',
          model: defaultProduct?.modelNumber || 'Active Air 1200mm',
          sn: serialNumber,
          verifyUrl: `http://localhost:5174/?verify=${serialNumber}`
        }),
        specsSnapshot: defaultProduct?.specs || {
          sweepMm: 1200,
          rpm: 370,
          powerWatts: 55,
          color: 'Glossy Rich Brown / Black',
          warrantyMonths: 24
        },
        warrantyExpiryDate: expiry.toISOString(),
        notes: 'Registered and verified by customer QR scan',
        scannedCount: 1,
        lastScannedAt: now.toISOString(),
        warrantyRegistration: registration
      };

      db.addUnits([newUnit]);
      if (isDatabaseConnected()) {
        try {
          await UnitModel.create(newUnit);
        } catch (e) {}
      }
      targetUnit = newUnit;
      console.log(`✨ [AUTO-REGISTERED UNIT] Created unit ${serialNumber} in database for customer ${customerName}`);
    }

    // Send dual emails (Customer + Management) automatically!
    const emailResult = await emailService.sendDualWarrantyRegistrationEmails({
      unit: targetUnit,
      registration
    });

    res.json({
      success: true,
      message: `Warranty registered successfully! Confirmation email sent to ${registration.customerEmail || customerName} and balajifansga@gmail.com.`,
      data: {
        unit: targetUnit,
        registration,
        emails: emailResult
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET stream raw QR PNG for label printing or physical scanners
unitsRouter.get('/:serialNumber/qr.png', async (req: Request, res: Response) => {
  try {
    const serialNumber = String(req.params.serialNumber).toUpperCase();
    let qrPayload = '';

    if (isDatabaseConnected()) {
      const mongoUnit = await UnitModel.findOne({ serialNumber }).lean();
      if (mongoUnit) qrPayload = mongoUnit.qrPayload;
    }

    if (!qrPayload) {
      const unit = db.getUnitBySerial(serialNumber);
      if (unit) qrPayload = unit.qrPayload;
    }

    if (!qrPayload) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="QR-${serialNumber}.png"`);

    await QRCode.toFileStream(res, qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

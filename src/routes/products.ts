import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { db } from '../data/db.js';
import { isDatabaseConnected } from '../config/db.js';
import { ProductModel } from '../models/Product.js';

export const productsRouter = Router();

// GET all products
productsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    if (isDatabaseConnected()) {
      const mongoProducts = await ProductModel.find().lean();
      const normalized = mongoProducts.map((p: any) => ({
        ...p,
        id: p.id || String(p._id)
      }));
      return res.json({ success: true, count: normalized.length, data: normalized });
    }
    const products = db.getProducts();
    res.json({ success: true, count: products.length, data: products });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single product
productsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (isDatabaseConnected()) {
      const product = await ProductModel.findOne({ id }).lean();
      if (product) {
        return res.json({ success: true, data: product });
      }
    }
    const product = db.getProductById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST new product
productsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, category, sku, modelNumber, description, price, imageUrl, specs, status } = req.body;
    if (!name || !category) {
      return res.status(400).json({ success: false, message: 'Name and category are required' });
    }

    const payload = {
      name,
      category,
      sku: sku || `GA-${category.substring(0, 2).toUpperCase()}-${Date.now().toString().slice(-4)}`,
      modelNumber: modelNumber || `GA-MODEL-${Date.now().toString().slice(-4)}`,
      description: description || '',
      price: Number(price) || 2499,
      imageUrl: imageUrl || '/active-air-fan.jpg',
      specs: specs || {
        sweepMm: 1200,
        bladeCount: 3,
        motorType: 'Heavy Duty 100% Copper Winding Motor',
        rpm: 370,
        powerWatts: 55,
        airDeliveryCmm: 270,
        voltage: '220V - 240V ~ 50Hz',
        color: 'Glossy Rich Brown / Black',
        hasRemote: false,
        warrantyMonths: 24
      },
      status: status || 'active'
    };

    const newProduct = db.addProduct(payload);

    if (isDatabaseConnected()) {
      await ProductModel.create(newProduct);
    }

    res.status(201).json({ success: true, message: 'Product created successfully', data: newProduct });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update product
productsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    let updated: any = null;

    if (isDatabaseConnected()) {
      const filter = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
      const mongoUpdated = await ProductModel.findOneAndUpdate(
        filter,
        { $set: req.body },
        { new: true }
      ).lean();
      if (mongoUpdated) {
        updated = mongoUpdated;
      }
    }

    const localUpdated = db.updateProduct(id, req.body);
    if (!updated) {
      updated = localUpdated;
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, message: 'Product updated successfully', data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE product
productsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (isDatabaseConnected()) {
      const filter = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await ProductModel.deleteOne(filter);
    }
    db.deleteProduct(id);
    res.json({ success: true, message: 'Product deleted from catalog' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

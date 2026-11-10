import mongoose from 'mongoose';
import dns from 'node:dns';
import dotenv from 'dotenv';
import { ProductModel } from '../models/Product.js';
import { db as fileDb } from '../data/db.js';

dotenv.config();

// Use reliable Google & Cloudflare DNS to resolve MongoDB Atlas SRV records
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  // fallback
}

let isMongoConnected = false;

export const connectMongoDB = async (): Promise<boolean> => {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('<db_password>')) {
    console.log('ℹ️ No valid MONGODB_URI found. Running with local storage.');
    return false;
  }

  try {
    console.log('⏳ Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isMongoConnected = true;

    mongoose.connection.on('error', (err) => {
      console.warn('MongoDB Atlas runtime warning:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB Atlas disconnected. System running on local disk backup.');
      isMongoConnected = false;
    });
    const clusterHost = uri.split('@')[1]?.split('/')[0] || 'Atlas Cluster';
    console.log('=======================================================');
    console.log('🍃 MongoDB Atlas Connected Successfully!');
    console.log(`📦 Database: grand_air (Cluster: ${clusterHost})`);
    console.log('=======================================================');

    const productCount = await ProductModel.countDocuments();
    if (productCount === 0) {
      console.log('📦 Seeding default Active Air Ceiling Fan models into MongoDB Atlas...');
      const defaultProducts = fileDb.getProducts();
      for (const p of defaultProducts) {
        await ProductModel.create(p);
      }
    }
    console.log(`✅ MongoDB Atlas Ready (${await ProductModel.countDocuments()} products in catalog)`);
    return true;
  } catch (err: any) {
    console.error('❌ MongoDB Atlas Connection Error:', err.message);
    console.log('⚠️ Falling back to local disk storage so your system keeps running.');
    isMongoConnected = false;
    return false;
  }
};

export const isDatabaseConnected = (): boolean => {
  return isMongoConnected && mongoose.connection.readyState === 1;
};

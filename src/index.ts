import express from 'express';
import cors from 'cors';
import { db } from './data/db.js';
import { connectMongoDB, isDatabaseConnected } from './config/db.js';
import { productsRouter } from './routes/products.js';
import { batchesRouter } from './routes/batches.js';
import { unitsRouter } from './routes/units.js';
import { verifyRouter } from './routes/verify.js';
import { analyticsRouter } from './routes/analytics.js';
import { ProductModel } from './models/Product.js';
import { BatchModel } from './models/Batch.js';
import { UnitModel } from './models/Unit.js';
import { emailService } from './services/email.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // Allow local frontend and any network client
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logger
app.use((req, _res, next) => {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${req.method} ${req.url}`);
  next();
});

// Root & API Info Handlers
const apiInfoHandler = (_req: express.Request, res: express.Response) => {
  res.json({
    message: 'Grand Air Electronics Manufacturing API is running',
    status: 'online',
    database: isDatabaseConnected() ? 'MongoDB Atlas (Cloud)' : 'Local File Storage',
    adminPortal: 'http://localhost:5173',
    endpoints: {
      health: '/api/health',
      products: '/api/products',
      batches: '/api/batches',
      units: '/api/units',
      analytics: '/api/analytics',
      verify: '/api/verify/:serialNumber'
    }
  });
};

app.get('/', apiInfoHandler);
app.get('/api', apiInfoHandler);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    service: 'Grand Air Electronics Manufacturing API',
    database: isDatabaseConnected() ? 'MongoDB Atlas (Cloud)' : 'Local File Storage',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// 1-Click Database Reset (Wipes all QR Units & Batches, Keeps Products Intact!)
app.all('/api/clear-all', async (_req, res) => {
  try {
    db.clearAll();
    if (isDatabaseConnected()) {
      await BatchModel.deleteMany({});
      await UnitModel.deleteMany({});
      await ProductModel.updateMany({}, { $set: { totalManufactured: 0, inStock: 0 } });
      const currentCount = await ProductModel.countDocuments();
      if (currentCount === 0) {
        for (const p of db.getProducts()) {
          await ProductModel.create(p);
        }
      }
    }
    console.log('🧹 [WIPE] All batches and QR units deleted. 3 fan models remain permanently.');
    res.json({
      success: true,
      message: 'All QR units and batches deleted. Products preserved permanently.',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1-Click Database Backup Download
app.get('/api/backup', (_req, res) => {
  const dbPath = db.getDbFilePath();
  const dateStr = new Date().toISOString().split('T')[0];
  res.download(dbPath, `GrandAir-Factory-DB-Backup-${dateStr}.json`);
});

// API Routes
app.use('/api/products', productsRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/units', unitsRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/analytics', analyticsRouter);

// Get sent email notification history for customer & management
app.get('/api/emails', (_req, res) => {
  res.json({
    success: true,
    count: emailService.getEmails().length,
    data: emailService.getEmails()
  });
});

// Diagnostic endpoint to test live Gmail SMTP delivery directly in the browser
app.get('/api/test-email', async (req, res) => {
  const targetEmail = String(req.query.to || 'balajifansga@gmail.com');
  console.log(`🧪 [TEST-EMAIL] Triggering direct SMTP connection test to: ${targetEmail}`);
  try {
    const result = await emailService.testEmailDelivery(targetEmail);
    res.json({
      success: result.success,
      message: result.success 
        ? `✅ Live email successfully delivered to ${targetEmail} via ${result.method || 'Gmail SMTP'}`
        : `❌ Email delivery failed: ${result.error}`,
      targetEmail,
      method: result.method,
      response: result.response,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server and Connect Database
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🌀 Grand Air Manufacturing API Server is running!`);
  console.log(`📡 Local Address: http://localhost:${PORT}`);
  console.log(`📦 Health Check:  http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);

  // Connect MongoDB Atlas
  await connectMongoDB();
});

export default app;


import mongoose from 'mongoose';

const uri = 'mongodb+srv://balajifansga_db_user:eibrS3id5IluhQIz@cluster0.wbgcxer.mongodb.net/grand_air?retryWrites=true&w=majority';

try {
  await mongoose.connect(uri);
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    if (c.collectionName === 'units' || c.collectionName === 'batches') {
      await c.deleteMany({});
      console.log('CLEARED:', c.collectionName);
    }
  }
  // Reset products counter to 0, keep all 3 fan models intact!
  const productsCol = mongoose.connection.db.collection('products');
  await productsCol.updateMany({}, { $set: { totalManufactured: 0, inStock: 0 } });

  console.log('✅ ALL_QR_UNITS_AND_BATCHES_CLEARED_FROM_ATLAS (The 3 products preserved permanently)');
  process.exit(0);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}

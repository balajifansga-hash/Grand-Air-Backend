import mongoose from 'mongoose';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

const uri = 'mongodb+srv://balajifanhosusvega_db_user:XolBTTwUfM6CRY1j@cluster0.mpyoz20.mongodb.net/grand_air?retryWrites=true&w=majority';

console.log('Connecting to cluster0.mpyoz20.mongodb.net...');
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log('🎉 ATLAS_CONNECTED_SUCCESSFULLY!');
  process.exit(0);
} catch (err) {
  console.error('Atlas connection error:', err.message);
  process.exit(1);
}


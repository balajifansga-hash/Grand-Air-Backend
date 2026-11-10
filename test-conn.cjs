const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch(e) {}

const mongoose = require('mongoose');
const uri = 'mongodb+srv://balajifansga_db_user:eibrS3id5IluhQIz@cluster0.wbgcxer.mongodb.net/grand_air?retryWrites=true&w=majority';

console.log('Connecting to:', uri.replace(/eibrS3id5IluhQIz/, '*****'));
mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log('✅ CONNECTED TO NEW MONGODB ATLAS CLUSTER!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  });


// db.js
import mongoose from 'mongoose';
import { env } from './envConfig.js';

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.MONGO_URI);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
}

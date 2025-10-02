import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import readline from 'readline';
import User from '../models/User.js';
import { env } from '../config/envConfig.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('=== Create Admin User ===\n');

    const name = await question('Full Name: ');
    const contact = await question('Contact (phone): ');
    const email = await question('Email: ');
    const password = await question('Password: ');
    const gender = await question('Gender (male/female): ');

    // Check if user already exists
    const existing = await User.findOne({ $or: [{ contact }, { email }] });
    
    if (existing) {
      console.log('\n⚠️  User already exists. Making them admin...');
      existing.isAdmin = true;
      existing.status = 'approved';
      await existing.save();
      console.log('✅ User updated to admin successfully!');
    } else {
      // Create new admin user
      const passwordHash = await bcrypt.hash(password, 10);
      
      const admin = await User.create({
        name,
        contact,
        email,
        passwordHash,
        gender: gender.toLowerCase(),
        isAdmin: true,
        status: 'approved',
        fatherName: 'Admin',
        motherName: 'Admin',
        age: 30,
        location: 'Admin',
        education: 'Admin',
        occupation: 'Admin',
        about: 'System Administrator'
      });

      console.log('\n✅ Admin user created successfully!');
      console.log(`User ID: ${admin._id}`);
    }

    console.log('\n📝 Login credentials:');
    console.log(`Contact: ${contact}`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('\n🔗 Admin panel: http://localhost:5174/admin');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    rl.close();
    await mongoose.connection.close();
    process.exit(0);
  }
}

createAdmin();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import { env } from './config/envConfig.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import imagekitRoutes from './routes/imagekitRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import passwordRoutes from './routes/passwordRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import helpRoutes from './routes/helpRoutes.js';

const app = express();
const server = http.createServer(app);

// ✅ Allowed origins (local + deployed frontend)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://dating-app-frontend-five.vercel.app'
];

// ✅ Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  }
});

// ✅ Middleware setup
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(helmet());
app.use(morgan('dev'));
app.use(cookieParser());

// ✅ Attach socket.io to req
app.use((req, res, next) => { req.io = io; next(); });

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/request', requestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/imagekit', imagekitRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/help', helpRoutes);

app.get('/', (req, res) => res.send('🚀 M Nikah API running successfully!'));

// ✅ Socket.io events
io.on('connection', (socket) => {
  console.log('🟢 User connected to socket');
  socket.on('join', (chatId) => socket.join(chatId));
  socket.on('disconnect', () => console.log('🔴 User disconnected'));
});

// ✅ Start function
const start = async () => {
  await connectDB();
  await connectRedis();
  server.listen(env.PORT || 5000, () => console.log(`✅ Server running on port ${env.PORT || 5000}`));
};

// ✅ Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await disconnectRedis();
  process.exit(0);
});

start();

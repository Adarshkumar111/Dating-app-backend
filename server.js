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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.CLIENT_ORIGIN, credentials: true }
});

app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(helmet());
app.use(morgan('dev'));
app.use(cookieParser());

// attach io to req
app.use((req, res, next) => { req.io = io; next(); });

// Routes
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

app.get('/', (req, res) => res.send('M Nikah API running'));

// Socket.io basic rooms by chatId
io.on('connection', (socket) => {
  socket.on('join', (chatId) => socket.join(chatId));
});

const start = async () => {
  await connectDB();
  await connectRedis();
  server.listen(env.PORT, () => console.log(`Server listening on ${env.PORT}`));
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await disconnectRedis();
  process.exit(0);
});

start();

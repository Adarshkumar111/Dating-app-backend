import multer from 'multer';
import path from 'path';
import ImageKit from 'imagekit';
import { env } from '../config/envConfig.js';

export const imagekit = new ImageKit({
  publicKey: env.IMAGEKIT_PUBLIC_KEY,
  privateKey: env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: env.IMAGEKIT_URL_ENDPOINT
});

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  // Check MIME type for images, videos, and audio
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images, videos, and audio allowed.`), false);
  }
}

export const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit for videos
});

export async function uploadToImageKit(file, folder = 'matrimonial') {
  if (!file) throw new Error('No file provided for upload');

  // Check if ImageKit is configured
  if (!env.IMAGEKIT_PUBLIC_KEY || !env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) {
    console.warn('⚠️ ImageKit not configured. Please set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT in .env file');
    console.warn('📝 Using placeholder URL. Images will not be stored.');
    // Return a placeholder image URL for development
    return `https://via.placeholder.com/400x400.png?text=${encodeURIComponent(file.originalname)}`;
  }

  try {
    const result = await imagekit.upload({
      file: file.buffer.toString('base64'),
      fileName: `${Date.now()}-${file.originalname}`,
      folder
    });
    console.log('✅ Image uploaded successfully:', result.url);
    return result.url;
  } catch (error) {
    console.error('❌ ImageKit upload error:', error);
    throw new Error('Image upload failed. Please try again.');
  }
}

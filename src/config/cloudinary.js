import { v2 as cloudinary } from 'cloudinary';

const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.warn('Cloudinary yapılandırması eksik env değişkenleri:', missing);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export default cloudinary;



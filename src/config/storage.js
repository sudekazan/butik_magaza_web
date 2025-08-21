import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import crypto from 'crypto';

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const generateFileName = (originalName) => {
  const ext = path.extname(originalName) || '.jpg';
  const base = path.basename(originalName, ext).replace(/[^a-z0-9\-]/gi, '_');
  const rand = crypto.randomBytes(6).toString('hex');
  return `${Date.now()}_${rand}_${base}${ext}`;
};

const isS3Enabled = () => {
  return !!(process.env.AWS_S3_BUCKET && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
};

let s3 = null;
if (isS3Enabled()) {
  s3 = new S3Client({ region: process.env.AWS_REGION });
}

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');
ensureDir(LOCAL_UPLOADS_DIR);

export async function saveImageBuffer({ buffer, originalName, contentType }) {
  const optimized = await sharp(buffer).rotate().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const fileName = generateFileName(originalName || 'image.jpg');

  if (isS3Enabled()) {
    const key = `images/${fileName}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: optimized,
      ACL: 'public-read',
      ContentType: contentType || 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    const baseUrl = process.env.CLOUDFRONT_URL || `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
    return {
      storage: 's3',
      url: `${baseUrl}/${key}`,
      key,
      size: optimized.length,
      mimeType: contentType || 'image/jpeg',
      uploadedAt: new Date()
    };
  }

  const filePath = path.join(LOCAL_UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, optimized);
  return {
    storage: 'local',
    url: `/uploads/${fileName}`,
    path: filePath,
    size: optimized.length,
    mimeType: contentType || 'image/jpeg',
    uploadedAt: new Date()
  };
}

export async function deleteImageByUrl(urlOrKey) {
  try {
    if (!urlOrKey) return;
    if (isS3Enabled()) {
      const baseUrl = process.env.CLOUDFRONT_URL || `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`;
      const key = urlOrKey.startsWith('http') ? urlOrKey.replace(baseUrl, '').replace(/^\//, '') : urlOrKey.replace(/^\//, '');
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
      return;
    }
    const rel = urlOrKey.startsWith('/uploads/') ? urlOrKey.replace(/^\//, '') : `uploads/${urlOrKey.replace(/^\//, '')}`;
    const full = path.join(process.cwd(), rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (e) {
    // Sessizce geç
  }
}

export function getPublicCacheControlHeader() {
  return 'public, max-age=31536000, immutable';
}




import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Product from './src/models/Product.js';
import { saveImageBuffer } from './src/config/storage.js';

const DRY_RUN = process.argv.includes('--dry');

async function connect() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/butik';
  await mongoose.connect(uri, { dbName: process.env.MONGO_DB || undefined });
}

function parseBase64(dataUri) {
  try {
    if (!dataUri || typeof dataUri !== 'string') return null;
    const match = dataUri.match(/^data:(.+);base64,(.*)$/);
    if (!match) return null;
    const mime = match[1];
    const b64 = match[2];
    const buf = Buffer.from(b64, 'base64');
    const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
    return { buffer: buf, mime, ext };
  } catch (e) { return null; }
}

async function migrateProduct(prod) {
  let changed = false;

  // Tekil base64ImageUrl
  if (prod.base64ImageUrl && prod.base64ImageUrl.startsWith('data:')) {
    const p = parseBase64(prod.base64ImageUrl);
    if (p) {
      if (!DRY_RUN) {
        const stored = await saveImageBuffer({ buffer: p.buffer, originalName: `${prod._id}${p.ext}`, contentType: p.mime });
        prod.imageUrl = stored.url;
      }
      changed = true;
    }
  }

  // Çoklu base64Images
  if (Array.isArray(prod.base64Images) && prod.base64Images.length > 0) {
    const newImages = [];
    for (let i = 0; i < prod.base64Images.length; i++) {
      const item = prod.base64Images[i];
      if (!item || !item.data) continue;
      const dataUri = item.data.startsWith('data:') ? item.data : `data:${item.mimeType || 'image/jpeg'};base64,${item.data}`;
      const p = parseBase64(dataUri);
      if (!p) continue;
      if (!DRY_RUN) {
        const stored = await saveImageBuffer({ buffer: p.buffer, originalName: `${prod._id}_${i}${p.ext}`, contentType: p.mime });
        newImages.push({ url: stored.url, alt: item.alt || '', isMain: !!item.isMain });
      }
      changed = true;
    }
    if (!DRY_RUN && newImages.length > 0) {
      prod.images = newImages;
      const main = newImages.find(im => im.isMain) || newImages[0];
      prod.imageUrl = main?.url || prod.imageUrl;
    }
  }

  if (changed && !DRY_RUN) {
    // Base64 alanlarını boşalt (tercihe göre saklanabilir)
    prod.base64ImageUrl = '';
    prod.base64Images = [];
    await prod.save();
  }
  return changed;
}

async function main() {
  await connect();
  const total = await Product.countDocuments({ $or: [
    { base64ImageUrl: { $regex: '^data:' } },
    { base64Images: { $exists: true, $not: { $size: 0 } } }
  ]});
  console.log(`Dönüştürülecek ürün sayısı: ${total}`);

  const cursor = Product.find({ $or: [
    { base64ImageUrl: { $regex: '^data:' } },
    { base64Images: { $exists: true, $not: { $size: 0 } } }
  ]}).cursor();

  let processed = 0, modified = 0;
  for await (const prod of cursor) {
    processed += 1;
    const ch = await migrateProduct(prod);
    if (ch) modified += 1;
    if (processed % 10 === 0) console.log(`İlerleme: ${processed}/${total} (değişen: ${modified})`);
  }

  console.log(`Bitti. İşlenen: ${processed}, Değişen: ${modified}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Hata:', e);
  process.exit(1);
});




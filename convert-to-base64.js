import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Product from './src/models/Product.js';

dotenv.config();

// MongoDB bağlantısı
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB bağlantısı başarılı');
  } catch (error) {
    console.error('❌ MongoDB bağlantı hatası:', error);
    process.exit(1);
  }
};

// Görseli Base64'e çevir
const convertImageToBase64 = (imagePath) => {
  try {
    if (!fs.existsSync(imagePath)) {
      console.log(`⚠️ Dosya bulunamadı: ${imagePath}`);
      return null;
    }
    
    const fileBuffer = fs.readFileSync(imagePath);
    const base64Data = fileBuffer.toString('base64');
    
    // MIME tipini dosya uzantısından belirle
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    
    return {
      data: base64Data,
      mimeType: mimeType
    };
  } catch (error) {
    console.error(`❌ Base64 dönüştürme hatası (${imagePath}):`, error);
    return null;
  }
};

// Ürün görsellerini Base64'e çevir
const convertProductImages = async (product) => {
  try {
    let hasChanges = false;
    const updates = {};
    
    // Ana görsel (imageUrl)
    if (product.imageUrl && product.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(process.cwd(), product.imageUrl.replace('/uploads/', ''));
      const base64Result = convertImageToBase64(imagePath);
      
      if (base64Result) {
        updates.base64ImageUrl = `data:${base64Result.mimeType};base64,${base64Result.data}`;
        hasChanges = true;
        console.log(`✅ Ana görsel Base64'e çevrildi: ${product.name}`);
      }
    }
    
    // Çoklu görseller (images)
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const base64Images = [];
      
      for (const image of product.images) {
        if (image.url && image.url.startsWith('/uploads/')) {
          const imagePath = path.join(process.cwd(), image.url.replace('/uploads/', ''));
          const base64Result = convertImageToBase64(imagePath);
          
          if (base64Result) {
            base64Images.push({
              data: base64Result.data,
              alt: image.alt || '',
              isMain: image.isMain || false,
              mimeType: base64Result.mimeType
            });
          }
        }
      }
      
      if (base64Images.length > 0) {
        updates.base64Images = base64Images;
        hasChanges = true;
        console.log(`✅ ${base64Images.length} çoklu görsel Base64'e çevrildi: ${product.name}`);
      }
    }
    
    // Varyant görselleri (variants)
    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
      const updatedVariants = [];
      
      for (const variant of product.variants) {
        if (variant.images && Array.isArray(variant.images) && variant.images.length > 0) {
          const variantBase64Images = [];
          
          for (const imageUrl of variant.images) {
            if (imageUrl && imageUrl.startsWith('/uploads/')) {
              const imagePath = path.join(process.cwd(), imageUrl.replace('/uploads/', ''));
              const base64Result = convertImageToBase64(imagePath);
              
              if (base64Result) {
                variantBase64Images.push({
                  data: base64Result.data,
                  alt: `${variant.color} variant image`,
                  isMain: false,
                  mimeType: base64Result.mimeType
                });
              }
            }
          }
          
          if (variantBase64Images.length > 0) {
            variant.base64Images = variantBase64Images;
            hasChanges = true;
          }
        }
        
        updatedVariants.push(variant);
      }
      
      if (hasChanges) {
        updates.variants = updatedVariants;
        console.log(`✅ Varyant görselleri Base64'e çevrildi: ${product.name}`);
      }
    }
    
    // Veritabanında güncelle
    if (hasChanges) {
      await Product.findByIdAndUpdate(product._id, updates);
      console.log(`💾 Ürün güncellendi: ${product.name}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Ürün dönüştürme hatası (${product.name}):`, error);
    return false;
  }
};

// Ana dönüştürme fonksiyonu
const convertAllProducts = async () => {
  try {
    console.log('🚀 Base64 dönüştürme işlemi başlıyor...');
    
    // Tüm ürünleri al
    const products = await Product.find({});
    console.log(`📦 Toplam ${products.length} ürün bulundu`);
    
    let convertedCount = 0;
    let errorCount = 0;
    
    for (const product of products) {
      try {
        const converted = await convertProductImages(product);
        if (converted) {
          convertedCount++;
        }
      } catch (error) {
        console.error(`❌ Ürün işlenirken hata (${product.name}):`, error);
        errorCount++;
      }
    }
    
    console.log('\n🎉 Dönüştürme işlemi tamamlandı!');
    console.log(`✅ Başarılı: ${convertedCount} ürün`);
    console.log(`❌ Hatalı: ${errorCount} ürün`);
    console.log(`📊 Toplam: ${products.length} ürün`);
    
  } catch (error) {
    console.error('❌ Ana dönüştürme hatası:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 MongoDB bağlantısı kapatıldı');
    process.exit(0);
  }
};

// Script'i çalıştır
if (import.meta.url === `file://${process.argv[1]}`) {
  connectDB().then(() => {
    convertAllProducts();
  });
}

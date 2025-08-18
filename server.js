import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import fs from 'fs';
import connectDB from './src/config/db.js';
import authRoutes from './src/routes/auth.js';
import categoryRoutes from './src/routes/categories.js';
import productRoutes from './src/routes/products.js';
import campaignRoutes from './src/routes/campaigns.js';
import featuredProductRoutes from './src/routes/featuredProducts.js';
import Product from './src/models/Product.js';
import Category from './src/models/Category.js';

dotenv.config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads klasörünü oluştur (eğer yoksa)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Uploads klasörü oluşturuldu:', uploadsDir);
}

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir!'), false);
    }
  }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Frontend routes
app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

app.get('/category', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'category.html'));
});

app.get('/category.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'category.html'));
});

app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'faq.html'));
});

// Pretty category slugs: "/elbise", "/tunik" gibi URL'leri kategori sayfasına yönlendir
app.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const reserved = new Set(['api', 'admin', 'uploads', 'product', 'category', 'faq']);
    if (!slug || reserved.has(slug) || slug.includes('.')) return next();
    // Slug DB'de olsa da olmasa da kategori SPA sayfasını döndür; client slug'ı ID'ye çevirecek
    return res.sendFile(path.join(__dirname, 'public', 'category.html'));
  } catch (err) {
    return next();
  }
});

// Admin Panel Routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/featured-products', featuredProductRoutes);

// Test upload endpoint (basit)
app.post('/api/upload-test', (req, res) => {
  console.log('🧪 Test upload endpoint çağrıldı');
  res.json({ 
    message: 'Test endpoint çalışıyor',
    timestamp: new Date().toISOString()
  });
});

// Upload endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    console.log('📤 Upload isteği alındı:', req.file);
    
    if (!req.file) {
      console.log('❌ Dosya bulunamadı');
      return res.status(400).json({ 
        message: 'Dosya yüklenmedi',
        error: 'NO_FILE' 
      });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    console.log('✅ Görsel başarıyla yüklendi:', imageUrl);
    
    res.json({ 
      imageUrl: imageUrl,
      message: 'Görsel başarıyla yüklendi',
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
  } catch (error) {
    console.error('❌ Upload hatası:', error);
    res.status(500).json({ 
      message: 'Görsel yüklenirken hata oluştu',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Upload error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        message: 'Dosya boyutu çok büyük (max: 10MB)' 
      });
    }
  }
  next(error);
});

// Healthcheck
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global hata yakalandı:', err);
  res.status(500).json({ 
    message: 'Sunucu hatası oluştu', 
    error: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Sayfa bulunamadı' });
});

//------------------------------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

// Start server after DB connection
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
      console.log(`📁 Uploads: ${path.join(__dirname, 'uploads')}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB bağlantısı başarısız:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM sinyali alındı, sunucu kapatılıyor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT sinyali alındı, sunucu kapatılıyor...');
  process.exit(0);
});


import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import fs from 'fs';
import mime from 'mime-types';
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

// Render.com ve diğer cloud platformlar için uploads klasörü yolu kontrolü
const getUploadsPath = (filename) => {
  // Güvenli hale getir: baştaki "/" işaretlerini kırp ve directory traversal engelle
  const safe = String(filename || '').replace(/^\/+/, '');
  if (safe.includes('..')) return null;

  // Önce mevcut uploads klasöründe ara
  const localPath = path.join(__dirname, 'uploads', safe);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // Eğer bulunamazsa, process.cwd() ile dene
  const cwdPath = path.join(process.cwd(), 'uploads', safe);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  // Son seçenek olarak localPath döndür (varsa middleware içinde tekrar kontrol edilecek)
  return localPath;
};

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
app.use(cors({
  origin: true, // Tüm origin'lere izin ver
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'X-Image-Info']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files - Uploads klasörü için özel middleware
app.use('/uploads', (req, res, next) => {
  try {
    const requested = decodeURIComponent(req.path || '');
    const safe = String(requested).replace(/^\/+/, '');
    if (safe.includes('..')) {
      return res.status(400).json({ 
        error: 'Geçersiz dosya yolu',
        message: 'Directory traversal engellendi'
      });
    }

    const filePath = getUploadsPath(safe);

    // Dosya var mı kontrol et
    if (!filePath || !fs.existsSync(filePath)) {
      console.log(`❌ Dosya bulunamadı: ${requested}`);
      console.log(`🔍 Aranan yol: ${filePath}`);
      
      // JSON hata döndür
      return res.status(404).json({ 
        error: 'Görsel bulunamadı',
        filename: requested,
        message: 'İstenen görsel dosyası bulunamadı',
        timestamp: new Date().toISOString()
      });
    }

    // Dosya boyutunu kontrol et
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return res.status(400).json({ 
        error: 'Boş dosya',
        filename: requested,
        message: 'Dosya boş veya bozuk'
      });
    }

    // MIME tipini daha güvenilir şekilde belirle
    let contentType = mime.lookup(filePath);
    
    // Eğer mime.lookup başarısız olursa, dosya uzantısına göre belirle
    if (!contentType) {
      const ext = path.extname(filePath).toLowerCase();
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.webp':
          contentType = 'image/webp';
          break;
        default:
          contentType = 'application/octet-stream';
      }
    }

    // Headers'ları ayarla
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 yıl cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    
    // Range request desteği (büyük dosyalar için)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
      res.setHeader('Accept-Ranges', 'bytes');
      
      const stream = fs.createReadStream(filePath, { start, end });
      return stream.pipe(res);
    }

    // Normal dosya gönderimi
    return res.sendFile(filePath, {
      headers: {
        'X-Image-Info': `size:${stats.size}, type:${contentType}`
      }
    });
  } catch (err) {
    console.error('❌ Uploads middleware hatası:', err);
    return res.status(500).json({ 
      error: 'Sunucu hatası',
      message: 'Görsel yüklenirken hata oluştu'
    });
  }
});

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

// Uploads klasörü health check
app.get('/api/uploads/health', (req, res) => {
  try {
    // Tüm olası uploads klasörlerini kontrol et
    const possibleDirs = [
      path.join(__dirname, 'uploads'),
      path.join(process.cwd(), 'uploads')
    ];
    
    let uploadsDir = null;
    let files = [];
    
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        uploadsDir = dir;
        files = fs.readdirSync(dir);
        break;
      }
    }
    
    if (!uploadsDir) {
      return res.status(500).json({
        status: 'unhealthy',
        error: 'Hiçbir uploads klasörü bulunamadı',
        searchedPaths: possibleDirs,
        currentDir: __dirname,
        cwd: process.cwd(),
        timestamp: new Date().toISOString(),
        message: 'Uploads klasörü bulunamadı'
      });
    }
    
    res.json({
      status: 'healthy',
      uploadsDir: uploadsDir,
      fileCount: files.length,
      timestamp: new Date().toISOString(),
      message: 'Uploads klasörü erişilebilir',
      searchedPaths: possibleDirs
    });
  } catch (error) {
    console.error('❌ Uploads health check hatası:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Uploads klasörü erişilemiyor'
    });
  }
});

// Dosya varlık kontrolü endpoint'i
app.get('/api/uploads/check/:filename(*)', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = getUploadsPath(filename);
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      res.json({
        exists: true,
        filename: filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        path: filePath
      });
    } else {
      // Tüm olası yolları kontrol et
      const possiblePaths = [
        path.join(__dirname, 'uploads', filename),
        path.join(process.cwd(), 'uploads', filename)
      ];
      
      res.json({
        exists: false,
        filename: filename,
        message: 'Dosya bulunamadı',
        searchedPaths: possiblePaths,
        currentDir: __dirname,
        cwd: process.cwd()
      });
    }
  } catch (error) {
    console.error('❌ Dosya kontrol hatası:', error);
    res.status(500).json({
      error: 'Dosya kontrol edilemedi',
      message: error.message
    });
  }
});

// Uploads klasörü debug endpoint'i
app.get('/api/uploads/debug', (req, res) => {
  try {
    // Tüm olası uploads klasörlerini kontrol et
    const possibleDirs = [
      path.join(__dirname, 'uploads'),
      path.join(process.cwd(), 'uploads')
    ];
    
    let uploadsDir = null;
    let files = [];
    
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        uploadsDir = dir;
        files = fs.readdirSync(dir);
        break;
      }
    }
    
    if (!uploadsDir) {
      return res.json({
        error: 'Hiçbir uploads klasörü bulunamadı',
        searchedPaths: possibleDirs,
        currentDir: __dirname,
        cwd: process.cwd()
      });
    }
    
    // İlk 10 dosyayı detaylı bilgi ile listele
    const fileDetails = files.slice(0, 10).map(filename => {
      const filePath = path.join(uploadsDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        path: filePath
      };
    });
    
    res.json({
      status: 'debug',
      uploadsDir: uploadsDir,
      totalFiles: files.length,
      sampleFiles: fileDetails,
      timestamp: new Date().toISOString(),
      message: 'Uploads klasörü debug bilgileri'
    });
  } catch (error) {
    console.error('❌ Uploads debug hatası:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Uploads klasörü debug bilgileri alınamadı'
    });
  }
});

// Görsel yükleme hatalarını raporla
app.post('/api/uploads/report-error', (req, res) => {
  try {
    const { imageUrl, timestamp, userAgent, page } = req.body;
    
    console.log('❌ Görsel yükleme hatası raporlandı:', {
      imageUrl,
      timestamp,
      userAgent: userAgent?.substring(0, 100),
      page
    });
    
    // Hata logunu dosyaya yaz
    const errorLog = `${timestamp} | ${imageUrl} | ${page} | ${userAgent?.substring(0, 100)}\n`;
    const logFile = path.join(__dirname, 'image-errors.log');
    
    fs.appendFileSync(logFile, errorLog);
    
    res.json({ 
      message: 'Hata raporu alındı',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Hata raporu işlenirken hata:', error);
    res.status(500).json({ 
      message: 'Hata raporu işlenemedi',
      error: error.message
    });
  }
});

// Upload endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    console.log('📤 Upload isteği alındı:', req.file);
    
    if (!req.file) {
      console.log('❌ Dosya bulunamadı');
      return res.status(400).json({ 
        message: 'Dosya yüklenmedi',
        error: 'NO_FILE' 
      });
    }
    
    // Dosyayı oku ve Base64'e çevir
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    
    // MIME tipini belirle
    const mimeType = req.file.mimetype || 'image/jpeg';
    
    // Base64 URL formatı oluştur
    const base64Url = `data:${mimeType};base64,${base64Data}`;
    
    // Eski sistem için URL (geriye dönük uyumluluk)
    const imageUrl = `/uploads/${req.file.filename}`;
    
    console.log('✅ Görsel başarıyla yüklendi ve Base64\'e çevrildi');
    console.log('📊 Dosya boyutu:', req.file.size, 'bytes');
    console.log('🔤 MIME tipi:', mimeType);
    console.log('📏 Base64 uzunluğu:', base64Data.length);
    
    res.json({ 
      // Eski sistem (geriye dönük uyumluluk)
      imageUrl: imageUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      
      // Yeni Base64 sistem
      base64Url: base64Url,
      base64Data: base64Data,
      mimeType: mimeType,
      
      message: 'Görsel başarıyla yüklendi ve Base64\'e çevrildi'
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

// Görsel test endpoint'i - Content-Type ve performans testi
app.get('/api/uploads/test/:filename(*)', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = getUploadsPath(filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'Dosya bulunamadı',
        filename: filename,
        message: 'Test edilecek dosya mevcut değil'
      });
    }
    
    const stats = fs.statSync(filePath);
    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    
    // Dosya başlığını oku (ilk 512 byte)
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    fs.closeSync(fd);
    
    const header = buffer.toString('hex', 0, bytesRead);
    
    // Dosya türü tespiti
    let detectedType = 'unknown';
    if (header.startsWith('ffd8ff')) detectedType = 'JPEG';
    else if (header.startsWith('89504e47')) detectedType = 'PNG';
    else if (header.startsWith('47494638')) detectedType = 'GIF';
    else if (header.startsWith('52494646') && header.includes('57454250')) detectedType = 'WebP';
    
    res.json({
      filename: filename,
      filePath: filePath,
      size: stats.size,
      contentType: contentType,
      detectedType: detectedType,
      header: header.substring(0, 32) + '...',
      created: stats.birthtime,
      modified: stats.mtime,
      message: 'Görsel dosya test bilgileri'
    });
    
  } catch (error) {
    console.error('❌ Görsel test hatası:', error);
    res.status(500).json({
      error: 'Test hatası',
      message: error.message
    });
  }
});

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


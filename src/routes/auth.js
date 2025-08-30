import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const router = Router();

// Admin şifresinin hash'ini oluştur (sadece ilk kurulumda)
const createAdminPasswordHash = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Varsayılan admin şifresi hash'i (admin123)
const DEFAULT_ADMIN_HASH = '$2b$12$HmFMQ/3FgwWGbelytkSj7OU6AI7taFd81ZPqMRU2dWSdWidskorU.';

// Runtime'da şifre değişikliği için memory'de tutulacak
let currentAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_HASH;

// Şifre değişikliklerini kalıcı hale getirmek için dosya sistemi kullan
// Daha güvenilir yol belirleme
const getPasswordFilePath = () => {
  // Önce process.cwd() ile dene
  const cwdPath = path.join(process.cwd(), 'admin-password.txt');
  
  // Eğer yazma izni yoksa, geçici dizin kullan
  try {
    // Test yazma işlemi
    fs.accessSync(process.cwd(), fs.constants.W_OK);
    return cwdPath;
  } catch (error) {
    console.warn('⚠️ Ana dizine yazma izni yok, geçici dizin kullanılıyor');
    // Geçici dizin kullan
    const tempPath = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'admin-password.txt');
    return tempPath;
  }
};

const PASSWORD_FILE = getPasswordFilePath();

// Sunucu başlatıldığında kalıcı dosyadan şifreyi yükle
const loadPasswordFromFile = async () => {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const savedPasswordHash = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
      if (savedPasswordHash && savedPasswordHash.length > 0) {
        currentAdminPasswordHash = savedPasswordHash;
        console.log('✅ Kalıcı şifre dosyasından yüklendi:', PASSWORD_FILE);
        return true;
      }
    }
  } catch (error) {
    console.warn('⚠️ Kalıcı şifre dosyası yüklenemedi, varsayılan şifre kullanılıyor:', error.message);
  }
  return false;
};

// Şifreyi dosyaya kaydetme işlemi
const savePasswordToFile = async (passwordHash) => {
  try {
    // Dosya dizinini oluştur (eğer yoksa)
    const dir = path.dirname(PASSWORD_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Şifreyi dosyaya yaz
    fs.writeFileSync(PASSWORD_FILE, passwordHash, 'utf8');
    console.log('✅ Şifre kalıcı dosyaya kaydedildi:', PASSWORD_FILE);
    return true;
  } catch (error) {
    console.error('❌ Şifre dosyaya kaydedilemedi:', error.message);
    return false;
  }
};

// Sunucu başlatıldığında şifreyi yükle
loadPasswordFromFile();

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: 'Şifre gerekli' });
    }
    
    // Memory'deki mevcut hash'i kullan
    const adminPasswordHash = currentAdminPasswordHash;
    
    // Şifreyi kontrol et
    const isPasswordValid = await bcrypt.compare(password, adminPasswordHash);
    
    if (isPasswordValid) {
      const token = jwt.sign(
        { role: 'admin', user: 'admin' },
        process.env.JWT_SECRET || 'changeme',
        { expiresIn: '12h' }
      );
      return res.json({ token, message: 'Giriş başarılı' });
    }
    
    return res.status(401).json({ message: 'Hatalı şifre' });
    
  } catch (error) {
    console.error('Login hatası:', error);
    return res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Şifre değiştirme endpoint'i
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Mevcut şifre ve yeni şifre gerekli' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Yeni şifre en az 6 karakter olmalı' });
    }
    
    // Mevcut şifreyi kontrol et (memory'deki hash ile)
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentAdminPasswordHash);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: 'Mevcut şifre hatalı' });
    }
    
    // Yeni şifreyi hash'le
    const newPasswordHash = await createAdminPasswordHash(newPassword);
    
    // Memory'deki hash'i güncelle (gerçek zamanlı değişim)
    currentAdminPasswordHash = newPasswordHash;
    
    // Şifreyi kalıcı dosyaya kaydet
    const fileSaved = await savePasswordToFile(newPasswordHash);
    
    if (fileSaved) {
      console.log('✅ Admin şifresi başarıyla değiştirildi!');
      console.log('🔑 Yeni hash:', newPasswordHash);
      console.log('💡 Şifre kalıcı dosyaya kaydedildi ve sunucu yeniden başlatıldığında korunacak');
      
      return res.json({ 
        message: 'Şifre başarıyla değiştirildi ve kalıcı olarak kaydedildi!',
        success: true,
        note: 'Şifre değişikliği hemen aktif oldu ve kalıcı olarak kaydedildi. Sunucu yeniden başlatıldığında da korunacak.',
        filePath: PASSWORD_FILE
      });
    } else {
      console.warn('⚠️ Şifre dosyaya kaydedilemedi, sadece memory\'de güncellendi');
      
      return res.json({ 
        message: 'Şifre değiştirildi ancak kalıcı kayıt başarısız!',
        success: true,
        warning: 'Şifre değişikliği aktif ancak sunucu yeniden başlatıldığında kaybolabilir. Lütfen sistem yöneticisi ile iletişime geçin.',
        filePath: PASSWORD_FILE
      });
    }
    
  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
    return res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Şifre durumu kontrol endpoint'i
router.get('/password-status', async (req, res) => {
  try {
    const fileExists = fs.existsSync(PASSWORD_FILE);
    const fileWritable = fileExists ? true : await savePasswordToFile('test');
    
    return res.json({
      memoryHash: currentAdminPasswordHash ? 'Mevcut' : 'Yok',
      filePath: PASSWORD_FILE,
      fileExists,
      fileWritable,
      defaultHash: currentAdminPasswordHash === DEFAULT_ADMIN_HASH
    });
  } catch (error) {
    console.error('Şifre durumu kontrol hatası:', error);
    return res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Yeni şifre hash'i oluşturmak için yardımcı endpoint (sadece development'ta)
if (process.env.NODE_ENV === 'development') {
  router.post('/generate-hash', async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ message: 'Şifre gerekli' });
      }
      
      const hash = await createAdminPasswordHash(password);
      return res.json({ 
        hash,
        message: 'Bu hash\'i ADMIN_PASSWORD_HASH environment variable\'ına ekleyin'
      });
    } catch (error) {
      console.error('Hash oluşturma hatası:', error);
      return res.status(500).json({ message: 'Hash oluşturulamadı' });
    }
  });
}

export default router;


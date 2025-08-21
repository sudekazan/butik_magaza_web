import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
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
const PASSWORD_FILE = path.join(process.cwd(), 'admin-password.txt');

// Sunucu başlatıldığında kalıcı dosyadan şifreyi yükle
try {
  if (fs.existsSync(PASSWORD_FILE)) {
    const savedPasswordHash = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
    if (savedPasswordHash && savedPasswordHash.length > 0) {
      currentAdminPasswordHash = savedPasswordHash;
      console.log('✅ Kalıcı şifre dosyasından yüklendi');
    }
  }
} catch (error) {
  console.warn('⚠️ Kalıcı şifre dosyası yüklenemedi, varsayılan şifre kullanılıyor:', error.message);
}

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
    try {
      fs.writeFileSync(PASSWORD_FILE, newPasswordHash, 'utf8');
      console.log('✅ Şifre kalıcı dosyaya kaydedildi:', PASSWORD_FILE);
    } catch (fileError) {
      console.warn('⚠️ Şifre dosyaya kaydedilemedi, sadece memory\'de güncellendi:', fileError.message);
    }
    
    console.log('✅ Admin şifresi başarıyla değiştirildi!');
    console.log('🔑 Yeni hash:', newPasswordHash);
    console.log('💡 Şifre kalıcı dosyaya kaydedildi ve sunucu yeniden başlatıldığında korunacak');
    
    return res.json({ 
      message: 'Şifre başarıyla değiştirildi ve kalıcı olarak kaydedildi!',
      success: true,
      note: 'Şifre değişikliği hemen aktif oldu ve kalıcı olarak kaydedildi. Sunucu yeniden başlatıldığında da korunacak.'
    });
    
  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
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


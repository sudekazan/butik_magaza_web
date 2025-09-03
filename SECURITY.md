# 🔐 Güvenlik Konfigürasyonu

## Admin Şifre Güvenliği

### Şifre Hash'leme
- Admin şifresi **bcrypt** algoritması ile hash'lenir
- **12 rounds** salt kullanılır (yüksek güvenlik)
- Şifreler asla düz metin olarak saklanmaz

### Varsayılan Şifre
- **Varsayılan şifre**: `admin123`
- **Hash'lenmiş hali**: `$2b$12$HmFMQ/3FgwWGbelytkSj7OU6AI7taFd81ZPqMRU2dWSdWidskorU.`

### Şifre Değiştirme

#### Yöntem 1: Admin Panel'den (Önerilen)
1. Admin paneline giriş yapın
2. **Ayarlar** sekmesine gidin
3. **Güvenlik Ayarları** bölümünde:
   - Mevcut şifrenizi girin
   - Yeni şifrenizi girin
   - Yeni şifreyi tekrar girin
4. **Şifreyi Değiştir** butonuna tıklayın
5. Console'da görünen yeni hash'i `.env` dosyasına ekleyin

#### Yöntem 2: Environment Variable ile
```bash
# .env dosyasına ekleyin
ADMIN_PASSWORD_HASH=yeni_hash_buraya
```

#### Yöntem 3: Terminal ile Hash Oluşturma
```bash
# Terminal'de yeni hash oluşturun
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('yeniSifre', 12).then(hash => console.log('Hash:', hash));"
```

### Güvenlik Özellikleri

✅ **Şifre Hash'leme**: bcrypt ile 12 rounds salt  
✅ **JWT Token**: 12 saatlik oturum süresi  
✅ **Hata Yönetimi**: Güvenli hata mesajları  
✅ **Input Validation**: Şifre doğrulama  
✅ **Development Tools**: Hash oluşturma endpoint'i  
✅ **Şifre Değiştirme**: Admin panel üzerinden güvenli şifre değiştirme  
✅ **Şifre Gücü Kontrolü**: Gerçek zamanlı şifre gücü göstergesi  
✅ **Şifre Eşleşme Kontrolü**: Frontend validation    

### Öneriler

1. **Varsayılan şifreyi değiştirin**
2. **Güçlü şifre kullanın** (en az 12 karakter)
3. **HTTPS kullanın** (production'da)
4. **JWT_SECRET** environment variable'ını değiştirin
5. **Düzenli şifre güncellemesi** yapın

### Production Konfigürasyonu

```bash
# .env dosyası
NODE_ENV=production
ADMIN_PASSWORD_HASH=your_secure_hash_here
JWT_SECRET=your_secure_jwt_secret_here
MONGO_URI=your_mongodb_connection_string
```

---
*Son güncelleme: Aralık 2024*

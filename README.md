# 🛍️ Butik Mağaza Web Sitesi

Modern ve şık tasarımlı butik mağaza web sitesi. Node.js, Express, MongoDB ve Tailwind CSS kullanılarak geliştirilmiştir.

## ✨ Özellikler

- 🎨 Modern ve responsive tasarım
- 📱 Mobil uyumlu arayüz
- 🔍 Ürün arama ve filtreleme
- 📂 Kategori bazlı ürün organizasyonu
- 🖼️ Resim yükleme ve yönetimi
- 🔐 Admin paneli ve güvenlik
- 💬 WhatsApp entegrasyonu
- 🎭 Renk varyantları ve beden stokları

## 🚀 Kurulum

### Gereksinimler
- Node.js (v16 veya üzeri)
- MongoDB (v5 veya üzeri)
- npm veya yarn

### Adımlar

1. **Projeyi klonlayın**
```bash
git clone <repository-url>
cd satın_almasız_web_sitesi
```

2. **Bağımlılıkları yükleyin**
```bash
npm install
```

3. **Çevre değişkenlerini ayarlayın**
`.env` dosyası oluşturun:
```env
MONGO_URI=mongodb://localhost:27017/butik_magaza
JWT_SECRET=your_secret_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
PORT=3000
NODE_ENV=development
```

4. **MongoDB'yi başlatın**
```bash
# MongoDB servisini başlatın
mongod
```

5. **Uygulamayı çalıştırın**
```bash
# Geliştirme modu
npm run dev

# Prodüksiyon modu
npm start
```

## 📁 Proje Yapısı

```
satın_almasız_web_sitesi/
├── public/                 # Frontend dosyaları
│   ├── admin/             # Admin paneli
│   ├── js/                # JavaScript dosyaları
│   └── index.html         # Ana sayfa
├── src/                   # Backend kaynak kodları
│   ├── config/            # Veritabanı konfigürasyonu
│   ├── middleware/        # Middleware'ler
│   ├── models/            # MongoDB modelleri
│   └── routes/            # API rotaları
├── uploads/               # Yüklenen resimler
├── server.js              # Ana sunucu dosyası
└── package.json           # Proje bağımlılıkları
```

## 🔧 API Endpoints

### Kategoriler
- `GET /api/categories` - Tüm kategorileri listele
- `POST /api/categories` - Yeni kategori ekle
- `PUT /api/categories/:id` - Kategori güncelle
- `DELETE /api/categories/:id` - Kategori sil

### Ürünler
- `GET /api/products` - Tüm ürünleri listele
- `GET /api/products/:id` - Tekil ürün getir
- `POST /api/products` - Yeni ürün ekle
- `PUT /api/products/:id` - Ürün güncelle
- `DELETE /api/products/:id` - Ürün sil

### Kimlik Doğrulama
- `POST /api/auth/login` - Admin girişi

## 🎨 Özelleştirme

### WhatsApp Numarası
`public/js/config.js` dosyasında WhatsApp numarasını güncelleyin:
```javascript
window.APP_CONFIG = {
  WHATSAPP_NUMBER: '905XXXXXXXXX'
};
```

### Renk Teması
`public/index.html` dosyasında Tailwind CSS renklerini özelleştirebilirsiniz.

## 🐛 Hata Ayıklama

### MongoDB Bağlantı Hatası
- MongoDB servisinin çalıştığından emin olun
- `.env` dosyasındaki `MONGO_URI` değerini kontrol edin

### Resim Yükleme Hatası
- `uploads/` klasörünün yazma izinlerini kontrol edin
- Dosya boyutu limitini kontrol edin

### Admin Giriş Hatası
- `.env` dosyasındaki admin bilgilerini kontrol edin
- JWT_SECRET değerinin doğru olduğundan emin olun

## 📱 Mobil Uyumluluk

- Responsive tasarım
- Touch-friendly arayüz
- Mobil menü
- Optimize edilmiş resimler

## 🔒 Güvenlik

- JWT tabanlı kimlik doğrulama
- Input validasyonu
- CORS koruması
- Rate limiting (gelecek sürümde)

## 🚀 Gelecek Özellikler

- [ ] Ödeme sistemi entegrasyonu
- [ ] Kullanıcı hesapları
- [ ] Favori ürünler
- [ ] Sepet sistemi
- [ ] Email bildirimleri
- [ ] Analytics dashboard

## 📄 Lisans

MIT License

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📞 İletişim

- Email: [email@example.com]
- WhatsApp: [WhatsApp numarası]

---

**Not:** Bu proje eğitim amaçlı geliştirilmiştir. Prodüksiyon ortamında kullanmadan önce güvenlik önlemlerini almayı unutmayın. 
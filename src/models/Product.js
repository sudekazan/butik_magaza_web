import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Eski alanlar (geriye dönük uyumluluk)
    size: { type: String, default: '' },
    stock: { type: Number, default: 0 },
    // Yeni: beden bazlı stok
    sizeStocks: [
      {
        size: { type: String, required: true, trim: true },
        stock: { type: Number, required: true, min: 0 }
      }
    ],
    // Yeni: gelişmiş varyant sistemi
    variants: [
      {
        color: { type: String, required: true, trim: true }, // Renk adı (örn: "Kırmızı", "Mavi")
        images: [{ type: String, default: '' }], // O renge ait görseller
        stock: { type: Number, default: 0, min: 0 }, // Toplam stok
        sizes: [{ type: String, trim: true }] // Beden seçenekleri
      }
    ],
    // Eski: renk varyantları (geriye dönük uyumluluk)
    colorVariants: [
      {
        name: { type: String, required: true, trim: true }, // Renk adı (örn: "Kırmızı", "Mavi")
        hexCode: { type: String, required: true, trim: true }, // Hex kodu (örn: "#FF0000")
        imageUrl: { type: String, default: '' }, // O renge ait resim (opsiyonel)
        isActive: { type: Boolean, default: true }
      }
    ],
    price: { type: Number, required: true },
    
    // ===== ESKİ SİSTEM (Geriye dönük uyumluluk için korunuyor) =====
    // Ana görsel (geriye dönük uyumluluk için)
    imageUrl: { type: String, default: '' },
    // Çoklu görseller
    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: '' },
        isMain: { type: Boolean, default: false } // Ana görsel olarak işaretlenmiş mi
      }
    ],
    
    // ===== YENİ BASE64 SİSTEM =====
    // Ana görsel Base64 (yeni sistem)
    base64ImageUrl: { type: String, default: '' },
    // Çoklu görseller Base64 (yeni sistem)
    base64Images: [
      {
        data: { type: String, required: true }, // Base64 verisi
        alt: { type: String, default: '' },
        isMain: { type: Boolean, default: false }, // Ana görsel olarak işaretlenmiş mi
        mimeType: { type: String, default: 'image/jpeg' } // MIME tipi (image/jpeg, image/png, vb.)
      }
    ],
    
    // Ana ürün renk bilgisi
    mainColor: { type: String, trim: true, default: '' }, // Ana ürün renk adı
    mainColorHex: { type: String, trim: true, default: '#000000' }, // Ana ürün renk kodu
    // Varyant ürün sistemi için yeni alanlar
    isVariant: { type: Boolean, default: false }, // Bu ürün bir varyant mı?
    parentProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // Ana ürün ID'si
    variantColor: { type: String, trim: true }, // Varyant rengi
    isActive: { type: Boolean, default: true },

    // Öne çıkan ürün sistemi
    featured: { type: Boolean, default: false, index: true }, // Öne çıkan ürün mü?
  
  },
  { timestamps: true }
);

export default mongoose.model('Product', productSchema);


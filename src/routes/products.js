import { Router } from 'express';
import { Buffer } from 'buffer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cloudinary from '../config/cloudinary.js';
import Product from '../models/Product.js';
import verifyToken from '../middleware/auth.js';

const router = Router();

// Multer memory storage (dosyaları geçici bellekte tutacağız)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Buffer'ı Cloudinary'e yüklemek için yardımcı fonksiyon
const uploadBufferToCloudinary = async (buffer, mimetype, folder) => {
  const dataUri = `data:${mimetype || 'image/jpeg'};base64,${Buffer.from(buffer).toString('base64')}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder: folder,
    resource_type: 'image',
    use_filename: true,
    unique_filename: true
  });
  return res; // { secure_url, public_id, ... }
};

// Listele (public)
router.get('/', async (req, res) => {
  try {
    const { categoryId, q } = req.query;
    const filter = { isActive: true };
    if (categoryId) filter.categoryId = categoryId;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ];
    }
    
    // Tüm ürünleri getir (ana ürünler + varyantlar) ve kategori referansını kontrol et
    const items = await Product.find(filter).sort({ createdAt: -1 }).populate('categoryId', 'name');
    
    // Kategorisi silinmiş ürünleri filtrele
    const validItems = items.filter(item => item.categoryId !== null);
    
    // Kategorisi silinmiş ürünleri otomatik olarak sil
    const invalidItems = items.filter(item => item.categoryId === null);
    if (invalidItems.length > 0) {
      console.log(`${invalidItems.length} ürünün kategorisi silinmiş, otomatik olarak siliniyor...`);
      await Product.deleteMany({ _id: { $in: invalidItems.map(item => item._id) } });
    }
    
    res.json(validItems);
  } catch (err) {
    console.error('Ürünler listelenirken hata:', err);
    res.status(500).json({ message: 'Ürünler alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});



// Öne çıkan ürünleri getir
router.get('/featured', async (req, res) => {
  try {
    const featuredProducts = await Product.find({ 
      isActive: true, 
      featured: true 
    })
    .sort({ createdAt: -1 })
    .populate('categoryId', 'name')
    .limit(8); // Maksimum 8 öne çıkan ürün
    
    // Kategorisi silinmiş ürünleri filtrele
    const validFeaturedProducts = featuredProducts.filter(item => item.categoryId !== null);
    
    res.json(validFeaturedProducts);
  } catch (err) {
    console.error('Öne çıkan ürünler alınırken hata:', err);
    res.status(500).json({ message: 'Öne çıkan ürünler alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Admin için tüm ürünleri listele (kategorisi silinmiş olanlar dahil)
router.get('/admin/all', verifyToken, async (req, res) => {
  try {
    const { categoryId, q } = req.query;
    const filter = {};
    if (categoryId) filter.categoryId = categoryId;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ];
    }
    
    // Tüm ürünleri getir (admin panel için)
    const items = await Product.find(filter).sort({ createdAt: -1 }).populate('categoryId', 'name');
    
    res.json(items);
  } catch (err) {
    console.error('Admin ürünler listelenirken hata:', err);
    res.status(500).json({ message: 'Ürünler alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});



// Tekil ürün getir
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Ürün ID gerekli' });
    
    const product = await Product.findById(id).populate('categoryId', 'name');
    
    if (!product) {
      return res.status(404).json({ message: 'Ürün bulunamadı' });
    }
    
    if (!product.isActive) {
      return res.status(404).json({ message: 'Ürün aktif değil' });
    }
      // Geçici görüntü düzeltme: varyant ürünlerde ana görsel yanlışsa, ilk görseli kullan
      if (product.isVariant === true && Array.isArray(product.images) && product.images.length > 0) {
        const firstUrl = product.images[0]?.url;
        if (firstUrl && firstUrl.startsWith('/uploads/') && product.imageUrl !== firstUrl) {
          product.imageUrl = firstUrl;
        }
      }

    res.json(product);
  } catch (err) {
    console.error('Ürün getirilirken hata:', err);
    res.status(500).json({ message: 'Ürün alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Ürün varyantlarını getir
router.get('/:id/variants', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Ürün ID gerekli' });
    
    // Önce ana ürünü kontrol et
    const mainProduct = await Product.findById(id);
    if (!mainProduct) {
      return res.status(404).json({ message: 'Ana ürün bulunamadı' });
    }
    
    let variantProducts = [];
    
    if (mainProduct.isVariant) {
      // Bu bir varyant ürünse, aynı parentProductId'ye sahip diğer varyantları getir
      variantProducts = await Product.find({
        parentProductId: mainProduct.parentProductId,
        isActive: true,
        _id: { $ne: id } // Kendisi hariç
      }).populate('categoryId', 'name');
      
      // Ana ürünü de ekle
      const parentProduct = await Product.findById(mainProduct.parentProductId).populate('categoryId', 'name');
      if (parentProduct && parentProduct.isActive) {
        variantProducts.unshift(parentProduct);
      }
    } else {
      // Bu ana ürünse, varyantlarını getir
      variantProducts = await Product.find({
        parentProductId: id,
        isActive: true
      }).populate('categoryId', 'name');
    }
    
    // Ana ürün bilgilerini de dahil et
    const response = {
      mainProduct: mainProduct,
      variants: variantProducts.map(variant => ({
        _id: variant._id,
        name: variant.name,
        price: variant.price,
        mainColor: variant.mainColor,
        mainColorHex: variant.mainColorHex,
        variantColor: variant.variantColor,
        imageUrl: variant.imageUrl,
        images: variant.images,
        stock: variant.stock,
        sizeStocks: variant.sizeStocks,
        isVariant: variant.isVariant
      }))
    };
    
    res.json(response);
  } catch (err) {
    console.error('Ürün varyantları getirilirken hata:', err);
    res.status(500).json({ message: 'Varyantlar alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Ekle
router.post('/', verifyToken, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'colorImages', maxCount: 20 },
  { name: 'variantImages', maxCount: 50 } // Yeni varyant görselleri için
]), async (req, res) => {
  try {
    const { categoryId, name, description, size, stock, price, sizeStocks, colorVariants, variants, mainColor, mainColorHex } = req.body;
    
    if (!categoryId || !name || !price) {
      return res.status(400).json({ message: 'categoryId, name, price zorunludur' });
    }
    
    // Çoklu görsel desteği
    let imageUrl = '';
    let images = [];
    let base64ImageUrl = '';
    let base64Images = [];
    
    if (req.files.images && req.files.images.length > 0) {
      const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/products';
      const uploaded = await Promise.all(req.files.images.map(async (file, index) => {
        try {
          const result = await uploadBufferToCloudinary(file.buffer, file.mimetype, folder);
          return {
            url: result.secure_url,
            name: file.originalname,
            isMain: index === 0,
            publicId: result.public_id
          };
        } catch (e) {
          console.error('Cloudinary yükleme hatası:', e);
          return null;
        }
      }));
      images = uploaded.filter(Boolean);
      if (images.length > 0) {
        imageUrl = images[0].url; // Ana görsel
      }
      // base64 alanlarını Cloudinary'e geçişle birlikte boş bırakıyoruz
      base64Images = [];
      base64ImageUrl = '';
    }
    
    // Yeni varyant sistemi işleme - Varyantlar ayrı ürün olarak kaydedilecek
    let processedVariants = [];
    if (variants) {
      try {
        const parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
        if (Array.isArray(parsedVariants)) {
          // Global varyant görsel sayacı
          // Form tarafındaki sıralamaya göre paylaştırmak için her varyantın kaç yeni dosya gönderdiği bilgisi
          let variantImageIndex = 0;
          const countsRaw = req.body.variantImageCounts;
          let variantImageCounts = null;
          try {
            if (countsRaw) {
              variantImageCounts = typeof countsRaw === 'string' ? JSON.parse(countsRaw) : countsRaw;
              if (!Array.isArray(variantImageCounts)) variantImageCounts = null;
            }
          } catch { variantImageCounts = null; }
          
          processedVariants = [];
          for (let variantIndex = 0; variantIndex < parsedVariants.length; variantIndex++) {
            const variant = parsedVariants[variantIndex];
            const processedVariant = {
              color: String(variant.color),
              colorHex: variant.colorHex || '#000000',
              stock: Number(variant.stock) || 0,
              sizeStocks: Array.isArray(variant.sizeStocks) ? variant.sizeStocks : [],
              images: []
            };

            if (req.files.variantImages && Array.isArray(req.files.variantImages)) {
              let take = 0;
              if (variantImageCounts && typeof variantImageCounts[variantIndex] === 'number') {
                take = Math.max(0, Number(variantImageCounts[variantIndex]) || 0);
              } else {
                take = variant.images
                  ? variant.images.filter((img) => {
                      if (!img || typeof img !== 'string') return false;
                      const str = String(img);
                      return !str.includes('/uploads/') && !/^https?:\/\//.test(str);
                    }).length
                  : 0;
              }

              if (take > 0) {
                const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/variants';
                const variantFiles = req.files.variantImages.slice(variantImageIndex, variantImageIndex + take);
                const uploadedVariantUrls = await Promise.all(variantFiles.map(async (file) => {
                  try {
                    const r = await uploadBufferToCloudinary(file.buffer, file.mimetype, folder);
                    return r.secure_url;
                  } catch (e) {
                    console.error('Cloudinary varyant yükleme hatası:', e);
                    return null;
                  }
                }));
                processedVariant.images = uploadedVariantUrls.filter(Boolean);
                variantImageIndex += take;
              } else {
                processedVariant.images = (variant.images || [])
                  .filter((img) => img && typeof img === 'string')
                  .map((img) => {
                    const match = String(img).match(/\/uploads\/[^'" )]+/);
                    return match ? match[0] : String(img);
                  });
              }
            } else if (variant.images && Array.isArray(variant.images)) {
              processedVariant.images = variant.images
                .filter((img) => img && typeof img === 'string')
                .map((img) => {
                  const match = String(img).match(/\/uploads\/[^'" )]+/);
                  return match ? match[0] : String(img);
                });
            }

            if (processedVariant && processedVariant.color && String(processedVariant.color).trim().length > 0) {
              processedVariants.push(processedVariant);
            }
          }
        }
      } catch (parseError) {
        console.error('variants parse hatası:', parseError);
      }
    }
    
    // Renk görselleri işleme (eski sistem - geriye dönük uyumluluk)
    if (req.files.colorImages && req.files.colorImages.length > 0) {
      const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/colors';
      const colorImageNames = req.body.colorImageNames || [];
      const colorVariantsData = req.body.colorVariants ? JSON.parse(req.body.colorVariants) : [];
      // Her renk varyantı için ilgili dosyayı bulup Cloudinary'e yükle
      await Promise.all(colorVariantsData.map(async (color, index) => {
        const file = req.files.colorImages.find(img => colorImageNames[index] === img.originalname);
        if (file) {
          try {
            const r = await uploadBufferToCloudinary(file.buffer, file.mimetype, folder);
            color.imageUrl = r.secure_url;
          } catch (e) {
            console.error('Cloudinary renk görseli yükleme hatası:', e);
          }
        }
      }));
    }
    
    const payload = {
      categoryId,
      name,
      description: description || '',
      size: size || '',
      stock: Number(stock) || 0,
      price: Number(price),
      imageUrl, // Geriye dönük uyumluluk
      images, // Yeni çoklu görsel alanı
      base64ImageUrl, // Yeni Base64 görsel alanı
      base64Images, // Yeni Base64 görseller alanı
      variants: processedVariants, // Yeni varyant sistemi
      mainColor: mainColor || '', // Ana ürün renk adı
      mainColorHex: mainColorHex || '#000000', // Ana ürün renk kodu

    };

    // Parse sizeStocks: JSON string or field[] form-data
    if (sizeStocks) {
      try {
        const parsed = typeof sizeStocks === 'string' ? JSON.parse(sizeStocks) : sizeStocks;
        if (Array.isArray(parsed)) {
          payload.sizeStocks = parsed
            .map((s) => ({ size: String(s.size), stock: Number(s.stock) }))
            .filter((s) => s.size && !Number.isNaN(s.stock));
        }
      } catch (parseError) {
        console.error('sizeStocks parse hatası:', parseError);
      }
    }

    // Parse colorVariants: JSON string or field[] form-data (eski sistem)
    if (colorVariants) {
      try {
        const parsed = typeof colorVariants === 'string' ? JSON.parse(colorVariants) : colorVariants;
        if (Array.isArray(parsed)) {
          payload.colorVariants = parsed
            .map((c) => ({ 
              name: String(c.name), 
              hexCode: String(c.hexCode), 
              imageUrl: String(c.imageUrl || ''), 
              isActive: c.isActive !== false 
            }))
            .filter((c) => c.name && c.hexCode);
        }
      } catch (parseError) {
        console.error('colorVariants parse hatası:', parseError);
      }
    }

    const created = await Product.create(payload);
    
    // Varyantları ayrı ürün olarak kaydet
    if (processedVariants.length > 0) {
      for (const variant of processedVariants) {
        // Varyant için Base64 görselleri oluştur
        let variantBase64Images = [];
        let variantBase64ImageUrl = '';
        
        if (variant.images && variant.images.length > 0) {
          try {
            // Eğer variant.images URL ise, dosyayı okuyup Base64'e çevir
            if (variant.images[0].startsWith('/uploads/')) {
              const filePath = path.join(process.cwd(), variant.images[0].replace('/uploads/', ''));
              if (fs.existsSync(filePath)) {
                const fileBuffer = fs.readFileSync(filePath);
                const base64Data = fileBuffer.toString('base64');
                variantBase64Images = [{
                  data: base64Data,
                  alt: `${variant.color} variant image`,
                  isMain: true,
                  mimeType: 'image/jpeg' // Varsayılan, gerçek MIME tipi tespit edilebilir
                }];
                variantBase64ImageUrl = `data:image/jpeg;base64,${base64Data}`;
              }
            }
          } catch (error) {
            console.error('Varyant Base64 dönüştürme hatası:', error);
          }
        }
        
        const variantProduct = new Product({
          name: `${created.name} - ${variant.color}`,
          description: created.description,
          price: created.price,
          categoryId: created.categoryId,
          // URL'leri olduğu gibi kullan: Cloudinary (http/https) ya da /uploads/ ise dokunma
          imageUrl: variant.images[0] ? String(variant.images[0]) : created.imageUrl,
          images: variant.images && variant.images.length > 0 ? variant.images.map((imgUrl) => ({
            url: String(imgUrl),
            alt: `${variant.color} variant image`,
            isMain: false
          })) : [],
          // Base64 görseller
          base64ImageUrl: variantBase64ImageUrl,
          base64Images: variantBase64Images,
          stock: variant.stock,
          sizeStocks: variant.sizeStocks || [],
          isVariant: true,
          parentProductId: created._id,
          variantColor: variant.color,
          mainColor: variant.color, // Varyant renk adı (variant.color)
          mainColorHex: variant.colorHex || '#000000', // Varyant renk kodu (variant.colorHex)
          isActive: true
        });
        
        await variantProduct.save();
      }
    }
    
    res.status(201).json(created);
  } catch (err) {
    console.error('Ürün eklenirken hata:', err);
    res.status(500).json({ message: 'Ürün eklenemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Güncelle
router.put('/:id', verifyToken, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'colorImages', maxCount: 20 },
  { name: 'variantImages', maxCount: 50 } // Yeni varyant görselleri için
]), async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, description, size, stock, price, isActive, sizeStocks, colorVariants, variants, mainColor, mainColorHex } = req.body;
    
    if (!id) return res.status(400).json({ message: 'Ürün ID gerekli' });
    
    const update = {};
    if (categoryId) update.categoryId = categoryId;
    if (name) update.name = name;
    if (description !== undefined) update.description = description;
    if (size !== undefined) update.size = size;
    if (stock !== undefined) update.stock = Number(stock);
    if (price !== undefined) update.price = Number(price);
    if (isActive !== undefined) update.isActive = isActive === 'true' || isActive === true;

    if (mainColor !== undefined) update.mainColor = mainColor;
    if (mainColorHex !== undefined) update.mainColorHex = mainColorHex;
    

    
    // Çoklu görsel desteği: imagesState ile nihai listeyi kur
    const currentProduct = await Product.findById(id);
    const prevImages = currentProduct?.images || [];
    let uploadedNewFiles = [];
    if (req.files.images && req.files.images.length > 0) {
      const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/products';
      const uploaded = await Promise.all((req.files.images || []).map(async (file) => {
        try {
          const r = await uploadBufferToCloudinary(file.buffer, file.mimetype, folder);
          return { url: r.secure_url, name: file.originalname, isMain: false };
        } catch (e) {
          console.error('Cloudinary (PUT) ürün görsel yükleme hatası:', e);
          return null;
        }
      }));
      uploadedNewFiles = uploaded.filter(Boolean);
    }

    // Frontend'in gönderdiği nihai durum
    let imagesState = null;
    if (req.body.imagesState) {
      try {
        imagesState = JSON.parse(req.body.imagesState);
      } catch (e) {
        console.warn('imagesState parse hatası:', e);
      }
    }

    if (Array.isArray(imagesState)) {
      // Eski dosyalar: URL bazlı eşleştir; Yeni dosyalar: newIndex ile uploadedNewFiles’dan al
      const finalImages = [];
      const urlsKept = new Set();

      imagesState.forEach((item) => {
        if (item && typeof item.newIndex === 'number') {
          const picked = uploadedNewFiles[item.newIndex];
          if (picked) {
            finalImages.push({ ...picked, isMain: !!item.isMain });
          }
        } else if (item && typeof item.url === 'string') {
          const url = String(item.url);
          const found = prevImages.find((im) => im && im.url === url);
          if (found && !urlsKept.has(url)) {
            finalImages.push({ ...found.toObject?.() || found, isMain: !!item.isMain });
            urlsKept.add(url);
          } else if (url && !urlsKept.has(url)) {
            finalImages.push({ url, isMain: !!item.isMain }); // legacy imageUrl fallback
            urlsKept.add(url);
          }
        }
      });

      // En az bir görsel varsa ana görseli belirle
      if (finalImages.length > 0) {
        if (!finalImages.some((im) => im.isMain)) {
          finalImages[0].isMain = true;
        }
        update.images = finalImages;
        const main = finalImages.find((im) => im.isMain) || finalImages[0];
        update.imageUrl = main.url;
      } else {
        update.images = [];
        update.imageUrl = '';
      }

            // Silinen dosyaları fiziksel olarak temizle (sadece önceki ve artık listede olmayan /uploads/ olanlar)
            // Yerel dosya silme kaldırıldı (Cloudinary kullanılıyor)
    } else if (uploadedNewFiles.length > 0) {
      // imagesState yoksa: mevcutları koru, yenileri sona ekle (mevcut davranış)
      const allImages = [...prevImages, ...uploadedNewFiles];
      if (!allImages.some((im) => im.isMain) && allImages.length > 0) {
        allImages[0].isMain = true;
      }
      update.images = allImages;
      const mainImage = allImages.find((im) => im.isMain) || allImages[0];
      if (mainImage) update.imageUrl = mainImage.url;
    }
    
    // Yeni varyant sistemi işleme
    let processedVariantsForUpsert = null;
    if (variants) {
      try {
        const parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
        if (Array.isArray(parsedVariants)) {
          let variantImageIndex = 0;
          // Frontend'den gelen her varyant için yeni dosya sayısı bilgisi
          const countsRaw = req.body.variantImageCounts;
          let variantImageCounts = null;
          try {
            if (countsRaw) {
              variantImageCounts = typeof countsRaw === 'string' ? JSON.parse(countsRaw) : countsRaw;
              if (!Array.isArray(variantImageCounts)) variantImageCounts = null;
            }
          } catch { variantImageCounts = null; }
          const processedVariants = [];
          for (let variantIndex = 0; variantIndex < parsedVariants.length; variantIndex++) {
            const variant = parsedVariants[variantIndex];
            const processedVariant = {
              color: String(variant.color),
              colorHex: variant.colorHex || '#000000',
              stock: Number(variant.stock) || 0,
              sizeStocks: Array.isArray(variant.sizeStocks)
                ? variant.sizeStocks.map((s) => ({ size: String(s.size), stock: Number(s.stock) || 0 }))
                : [],
              images: []
            };

            if (req.files.variantImages && Array.isArray(req.files.variantImages)) {
              let take = 0;
              if (variantImageCounts && typeof variantImageCounts[variantIndex] === 'number') {
                take = Math.max(0, Number(variantImageCounts[variantIndex]) || 0);
              } else {
                take = variant.images
                  ? variant.images.filter((img) => {
                      if (!img || typeof img !== 'string') return false;
                      const str = String(img);
                      return !str.includes('/uploads/') && !/^https?:\/\//.test(str);
                    }).length
                  : 0;
              }

              if (take > 0) {
                const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/variants';
                const variantFiles = req.files.variantImages.slice(variantImageIndex, variantImageIndex + take);
                const uploadedVariantUrls = await Promise.all(variantFiles.map(async (file) => {
                  try {
                    const r = await uploadBufferToCloudinary(file.buffer, file.mimetype, folder);
                    return r.secure_url;
                  } catch (e) {
                    console.error('Cloudinary (PUT) varyant görsel yükleme hatası:', e);
                    return null;
                  }
                }));
                processedVariant.images = uploadedVariantUrls.filter(Boolean);
                variantImageIndex += take;
              } else if (variant.images && Array.isArray(variant.images)) {
                processedVariant.images = variant.images
                  .filter((img) => img && typeof img === 'string')
                  .map((img) => String(img));
              }
            } else if (variant.images && Array.isArray(variant.images)) {
              processedVariant.images = variant.images
                .filter((img) => img && typeof img === 'string')
                .map((img) => String(img));
            }

            if (!processedVariant.stock && processedVariant.sizeStocks.length > 0) {
              processedVariant.stock = processedVariant.sizeStocks.reduce((total, s) => total + (Number(s.stock) || 0), 0);
            }

            if (processedVariant && processedVariant.color) processedVariants.push(processedVariant);
          }

          update.variants = processedVariants;
          processedVariantsForUpsert = processedVariants;
        }
      } catch (parseError) {
        console.error('variants parse hatası:', parseError);
      }
    }
    
    // Renk görselleri işleme (eski sistem - geriye dönük uyumluluk)
    if (req.files.colorImages && req.files.colorImages.length > 0) {
      // Renk görsellerini colorVariants ile eşleştir
      const colorImageNames = req.body.colorImageNames || [];
      const colorVariantsData = req.body.colorVariants ? JSON.parse(req.body.colorVariants) : [];
      
      // Her renk varyantı için görsel URL'ini ekle
      await Promise.all(colorVariantsData.map(async (color, index) => {
        const colorImage = req.files.colorImages.find(img => colorImageNames[index] === img.originalname);
        if (colorImage) {
          try {
            const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/colors';
            const r = await uploadBufferToCloudinary(colorImage.buffer, colorImage.mimetype, folder);
            color.imageUrl = r.secure_url;
          } catch (e) {
            console.error('Cloudinary (PUT) renk görseli yükleme hatası:', e);
          }
        }
      }));
    }

    if (sizeStocks) {
      try {
        const parsed = typeof sizeStocks === 'string' ? JSON.parse(sizeStocks) : sizeStocks;
        if (Array.isArray(parsed)) {
          update.sizeStocks = parsed
            .map((s) => ({ size: String(s.size), stock: Number(s.stock) }))
            .filter((s) => s.size && !Number.isNaN(s.stock));
        }
      } catch (parseError) {
        console.error('sizeStocks parse hatası:', parseError);
      }
    }

    if (colorVariants) {
      try {
        const parsed = typeof colorVariants === 'string' ? JSON.parse(colorVariants) : colorVariants;
        if (Array.isArray(parsed)) {
          update.colorVariants = parsed
            .map((c) => ({ 
              name: String(c.name), 
              hexCode: String(c.hexCode), 
              imageUrl: String(c.imageUrl || ''), 
              isActive: c.isActive !== false 
            }))
            .filter((c) => c.name && c.hexCode);
        }
      } catch (parseError) {
        console.error('colorVariants parse hatası:', parseError);
      }
    }

    const prev = await Product.findById(id);
    if (!prev) return res.status(404).json({ message: 'Ürün bulunamadı' });

    // Not deleting old images when adding new ones - they should be additive
    // Old images will be kept and new images will be added to them

    // Varyant ürünlerini upsert et (ayrı ürünler olarak)
    if (processedVariantsForUpsert && Array.isArray(processedVariantsForUpsert)) {
      for (const v of processedVariantsForUpsert) {
        try {
          const baseName = req.body.name || prev.name || '';
          const variantName = `${baseName} - ${v.color}`.trim();
          const baseImageUrl = (v.images && v.images[0]) ? v.images[0] : (update.imageUrl || prev.imageUrl || '');
          const imagesArray = (v.images || []).map((imgUrl) => ({
            url: String(imgUrl),
            alt: `${v.color} variant image`,
            isMain: false
          }));

          const existingVariant = await Product.findOne({ parentProductId: id, isVariant: true, variantColor: v.color });
          if (existingVariant) {
            existingVariant.name = variantName || existingVariant.name;
            existingVariant.price = Number(req.body.price) || existingVariant.price;
            existingVariant.imageUrl = baseImageUrl || existingVariant.imageUrl;
            if (imagesArray.length > 0) existingVariant.images = imagesArray;
            existingVariant.stock = Number(v.stock) || existingVariant.stock;
            existingVariant.sizeStocks = Array.isArray(v.sizeStocks) ? v.sizeStocks : existingVariant.sizeStocks;
            existingVariant.mainColor = v.color;
            existingVariant.mainColorHex = v.colorHex || existingVariant.mainColorHex || '#000000';
            await existingVariant.save();
          } else {
            const variantProduct = new Product({
              categoryId: req.body.categoryId || prev.categoryId,
              name: variantName,
              description: req.body.description || prev.description || '',
              price: Number(req.body.price) || prev.price || 0,
              imageUrl: baseImageUrl,
              images: imagesArray,
              stock: Number(v.stock) || 0,
              sizeStocks: Array.isArray(v.sizeStocks) ? v.sizeStocks : [],
              isVariant: true,
              parentProductId: id,
              variantColor: v.color,
              mainColor: v.color,
              mainColorHex: v.colorHex || '#000000',
              isActive: true
            });
            await variantProduct.save();
          }
        } catch (variantUpsertError) {
          console.error('Varyant upsert hatası:', variantUpsertError);
        }
      }
    }

    const updated = await Product.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ message: 'Ürün bulunamadı' });
    res.json(updated);
  } catch (err) {
    console.error('Ürün güncellenirken hata:', err);
    res.status(500).json({ message: 'Ürün güncellenemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Çoklu silme
router.delete('/bulk', verifyToken, async (req, res) => {
  try {
    console.log('🗑️ Bulk delete endpoint çağrıldı');
    console.log('📋 Request headers:', req.headers);
    console.log('📋 Request body:', req.body);
    console.log('📋 Request body type:', typeof req.body);
    console.log('📋 Request body keys:', Object.keys(req.body || {}));
    console.log('🔑 User ID:', req.user.id);
    
    const { productIds } = req.body;
    console.log('📋 productIds:', productIds);
    console.log('📋 productIds type:', typeof productIds);
    console.log('📋 productIds isArray:', Array.isArray(productIds));
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      console.log('❌ Validation hatası: productIds geçersiz');
      console.log('  - productIds exists:', !!productIds);
      console.log('  - productIds isArray:', Array.isArray(productIds));
      console.log('  - productIds length:', productIds?.length);
      return res.status(400).json({ message: 'Ürün ID listesi gerekli' });
    }
    
    console.log('✅ productIds validation geçti, uzunluk:', productIds.length);
    
    // Geçersiz ID'leri filtrele
    const validIds = productIds.filter(id => {
      const isValid = id && typeof id === 'string' && id.length === 24;
      if (!isValid) {
        console.log('⚠️ Geçersiz ID bulundu:', id, 'tip:', typeof id, 'uzunluk:', id?.length);
      }
      return isValid;
    });
    
    console.log('🔍 Geçerli ID sayısı:', validIds.length, 'toplam:', productIds.length);
    
    if (validIds.length === 0) {
      console.log('❌ Hiç geçerli ID bulunamadı');
      return res.status(400).json({ message: 'Geçerli ürün ID bulunamadı' });
    }
    // Bağımsız silme: yalnızca seçilen ID'leri sil
    const initialProducts = await Product.find({ _id: { $in: validIds } });
    const deleteSet = new Set(validIds);

    const allIdsToDelete = Array.from(deleteSet);
    // Silmeden önce ürünleri al (görselleri silmek için) — genişletilmiş liste
    const products = await Product.find({ _id: { $in: allIdsToDelete } });
    
    // Görselleri sil
    products.forEach(prod => {
      // Çoklu görselleri sil
      if (prod.images && prod.images.length > 0) {
        prod.images.forEach(img => {
          if (img.url && img.url.startsWith('/uploads/')) {
            const safeRelative = img.url.replace(/^\//, '');
            const oldPath = path.join(process.cwd(), safeRelative);
            fs.unlink(oldPath, (err) => {
              if (err) console.error('Ürün resmi silinirken hata:', err);
            });
          }
        });
      } else if (prod.imageUrl && prod.imageUrl.startsWith('/uploads/')) {
        // Eski tek görsel desteği
        const safeRelative = prod.imageUrl.replace(/^\//, '');
        const oldPath = path.join(process.cwd(), safeRelative);
        fs.unlink(oldPath, (err) => {
          if (err) console.error('Ürün resmi silinirken hata:', err);
        });
      }
      
      // Varyant görsellerini sil
      if (prod.variants && prod.variants.length > 0) {
        prod.variants.forEach(variant => {
          if (variant.images && Array.isArray(variant.images)) {
            variant.images.forEach(imgUrl => {
              if (imgUrl && imgUrl.startsWith('/uploads/')) {
                const safeRelative = imgUrl.replace(/^\//, '');
                const oldPath = path.join(process.cwd(), safeRelative);
                fs.unlink(oldPath, (err) => {
                  if (err) console.error('Varyant resmi silinirken hata:', err);
                });
              }
            });
          }
        });
      }
    });
    
    const result = await Product.deleteMany({ _id: { $in: allIdsToDelete } });

    // Bağımsız silme: ebeveyn-varyant ilişkisini değiştirmeyin

    res.json({ 
      message: `${result.deletedCount} ürün (varyantlar dahil) başarıyla silindi`,
      deletedCount: result.deletedCount,
      requestedCount: allIdsToDelete.length
    });
  } catch (err) {
    console.error('Çoklu ürün silinirken hata:', err);
    res.status(500).json({ message: 'Ürünler silinemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Ürün güncelleme (PATCH)
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Ürün ID gerekli' });
    
    const updateData = req.body;
    
    // Sadece belirli alanların güncellenmesine izin ver
    const allowedFields = ['featured', 'isActive', 'price', 'name', 'description'];
    const filteredData = {};
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredData[key] = updateData[key];
      }
    });
    
    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ message: 'Güncellenebilir alan bulunamadı' });
    }
    
    const updatedProduct = await Product.findByIdAndUpdate(
      id, 
      filteredData, 
      { new: true, runValidators: true }
    ).populate('categoryId', 'name');
    
    if (!updatedProduct) {
      return res.status(404).json({ message: 'Ürün bulunamadı' });
    }
    
    res.json(updatedProduct);
  } catch (err) {
    console.error('Ürün güncellenirken hata:', err);
    res.status(500).json({ message: 'Ürün güncellenemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Tekil silme
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Ürün ID gerekli' });
    
    const prod = await Product.findByIdAndDelete(id);
    if (!prod) return res.status(404).json({ message: 'Ürün bulunamadı' });
    
    // Çoklu görselleri sil
    if (prod.images && prod.images.length > 0) {
      prod.images.forEach(img => {
        if (img.url && img.url.startsWith('/uploads/')) {
          const safeRelative = img.url.replace(/^\//, '');
          const oldPath = path.join(process.cwd(), safeRelative);
          fs.unlink(oldPath, (err) => {
            if (err) console.error('Ürün resmi silinirken hata:', err);
          });
        }
      });
    } else if (prod.imageUrl && prod.imageUrl.startsWith('/uploads/')) {
      // Eski tek görsel desteği
      const safeRelative = prod.imageUrl.replace(/^\//, '');
      const oldPath = path.join(process.cwd(), safeRelative);
      fs.unlink(oldPath, (err) => {
        if (err) console.error('Ürün resmi silinirken hata:', err);
      });
    }
    
    // Varyant görsellerini sil
    if (prod.variants && prod.variants.length > 0) {
      prod.variants.forEach(variant => {
        if (variant.images && Array.isArray(variant.images)) {
          variant.images.forEach(imgUrl => {
            if (imgUrl && imgUrl.startsWith('/uploads/')) {
              const safeRelative = imgUrl.replace(/^\//, '');
              const oldPath = path.join(process.cwd(), safeRelative);
              fs.unlink(oldPath, (err) => {
                if (err) console.error('Varyant resmi silinirken hata:', err);
              });
            }
          });
        }
      });
    }
    // Bağımsız silme: ana ürünü silerken varyantları dokunma

    // Bağımsız silme: varyant silinirken ebeveyn ürünün variants listesine dokunma

    res.json({ success: true });
  } catch (err) {
    console.error('Ürün silinirken hata:', err);
    res.status(500).json({ message: 'Ürün silinemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Tek görsel işlemleri: Ana görseli ayarla
router.patch('/:id/images/main', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body || {};
    if (!id || !url) return res.status(400).json({ message: 'ID ve url gerekli' });

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Ürün bulunamadı' });

    if (Array.isArray(product.images) && product.images.length > 0) {
      let matched = false;
      const normalizedTarget = String(url).match(/\/uploads\/[^'" )]+/);
      const targetUrl = normalizedTarget ? normalizedTarget[0] : String(url);
      product.images = product.images.map((im) => {
        if (!im) return im;
        const imUrl = String(im.url || '');
        const same = imUrl === targetUrl;
        if (same) matched = true;
        return { ...im.toObject?.() || im, isMain: same };
      });
      if (!matched && targetUrl) {
        if (product.imageUrl && product.imageUrl === targetUrl) {
          product.images.unshift({ url: targetUrl, isMain: true });
          matched = true;
        }
      }
      if (product.images.length > 0) {
        const main = product.images.find((im) => im && im.isMain) || product.images[0];
        product.imageUrl = main?.url || '';
      } else if (product.imageUrl) {
        product.imageUrl = product.imageUrl;
      }
      await product.save();
      return res.json({ success: true, product });
    }

    const normalizedTarget = String(url).match(/\/uploads\/[^'" )]+/);
    const targetUrl = normalizedTarget ? normalizedTarget[0] : String(url);
    if (product.imageUrl && product.imageUrl === targetUrl) {
      return res.json({ success: true, product });
    }
    product.imageUrl = targetUrl;
    await product.save();
    return res.json({ success: true, product });
  } catch (err) {
    console.error('Ana görsel ayarlanırken hata:', err);
    res.status(500).json({ message: 'Ana görsel ayarlanamadı' });
  }
});

// Tek görsel işlemleri: Görsel sil
router.delete('/:id/images', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body || {};
    if (!id || !url) return res.status(400).json({ message: 'ID ve url gerekli' });

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Ürün bulunamadı' });

    const normalizedTarget = String(url).match(/\/uploads\/[^'" )]+/);
    const targetUrl = normalizedTarget ? normalizedTarget[0] : String(url);

    let removed = false;
    if (Array.isArray(product.images) && product.images.length > 0) {
      const before = product.images.length;
      const wasMain = product.images.some((im) => im && im.url === targetUrl && im.isMain);
      product.images = product.images.filter((im) => im && im.url !== targetUrl);
      removed = product.images.length < before;

      if (wasMain && product.images.length > 0) {
        product.images = product.images.map((im, idx) => ({ ...im.toObject?.() || im, isMain: idx === 0 }));
        product.imageUrl = product.images[0]?.url || '';
      }

      if (product.images.length === 0) {
        product.imageUrl = '';
      } else if (!product.images.some((im) => im && im.isMain)) {
        product.images[0].isMain = true;
        product.imageUrl = product.images[0]?.url || '';
      }
    } else if (product.imageUrl) {
      if (product.imageUrl === targetUrl) {
        product.imageUrl = '';
        removed = true;
      }
    }

    if (!removed) return res.status(404).json({ message: 'Silinecek görsel bulunamadı' });

    if (targetUrl && targetUrl.startsWith('/uploads/')) {
      const safeRelative = targetUrl.replace(/^\//, '');
      const oldPath = path.join(process.cwd(), safeRelative);
      fs.unlink(oldPath, (err) => {
        if (err) console.error('Görsel fiziksel silinirken hata:', err);
      });
    }

    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    console.error('Görsel silinirken hata:', err);
    res.status(500).json({ message: 'Görsel silinemedi' });
  }
});

export default router;


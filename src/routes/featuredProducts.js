import express from 'express';
import FeaturedProduct from '../models/FeaturedProduct.js';
import Product from '../models/Product.js';
import verifyToken from '../middleware/auth.js';

const router = express.Router();

// Öne çıkan ürünleri getir
router.get('/', async (req, res) => {
  try {
    const featuredProducts = await FeaturedProduct.find({ isActive: true })
      .populate('productId')
      .sort({ priority: 1, createdAt: -1 });
    
    res.json(featuredProducts);
  } catch (error) {
    res.status(500).json({ message: 'Öne çıkan ürünler yüklenirken hata oluştu', error: error.message });
  }
});

// Tek bir öne çıkan ürünü getir (düzenleme için)
router.get('/:id', async (req, res) => {
  try {
    const featuredProduct = await FeaturedProduct.findById(req.params.id).populate('productId');
    
    if (!featuredProduct) {
      return res.status(404).json({ message: 'Öne çıkan ürün bulunamadı' });
    }
    
    res.json(featuredProduct);
  } catch (error) {
    res.status(500).json({ message: 'Öne çıkan ürün yüklenirken hata oluştu', error: error.message });
  }
});

// Öne çıkan ürün ekle
router.post('/', verifyToken, async (req, res) => {
  try {
    const { productId, priority, notes, endDate } = req.body;
    
    // Ürün var mı kontrol et
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Ürün bulunamadı' });
    }
    
    // Zaten öne çıkan mı kontrol et
    const existing = await FeaturedProduct.findOne({ productId });
    if (existing) {
      return res.status(400).json({ message: 'Bu ürün zaten öne çıkan olarak işaretlenmiş' });
    }
    
    const featuredProduct = new FeaturedProduct({
      productId,
      priority: priority || 1,
      notes,
      endDate: endDate || null
    });
    
    await featuredProduct.save();
    
    // Ürünü featured olarak işaretle
    await Product.findByIdAndUpdate(productId, { featured: true });
    
    const populated = await FeaturedProduct.findById(featuredProduct._id).populate('productId');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Öne çıkan ürün eklenirken hata oluştu', error: error.message });
  }
});

// Öne çıkan ürün güncelle
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { priority, isActive, notes, endDate } = req.body;
    
    const featuredProduct = await FeaturedProduct.findByIdAndUpdate(
      req.params.id,
      { priority, isActive, notes, endDate },
      { new: true }
    ).populate('productId');
    
    if (!featuredProduct) {
      return res.status(404).json({ message: 'Öne çıkan ürün bulunamadı' });
    }
    
    // Ürün featured durumunu güncelle
    await Product.findByIdAndUpdate(featuredProduct.productId._id, { 
      featured: featuredProduct.isActive 
    });
    
    res.json(featuredProduct);
  } catch (error) {
    res.status(500).json({ message: 'Öne çıkan ürün güncellenirken hata oluştu', error: error.message });
  }
});

// Öne çıkan ürün sil
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const featuredProduct = await FeaturedProduct.findById(req.params.id);
    if (!featuredProduct) {
      return res.status(404).json({ message: 'Öne çıkan ürün bulunamadı' });
    }
    
    // Ürün featured durumunu kaldır
    await Product.findByIdAndUpdate(featuredProduct.productId, { featured: false });
    
    await FeaturedProduct.findByIdAndDelete(req.params.id);
    res.json({ message: 'Öne çıkan ürün başarıyla kaldırıldı' });
  } catch (error) {
    res.status(500).json({ message: 'Öne çıkan ürün silinirken hata oluştu', error: error.message });
  }
});

// Öne çıkan ürünleri yeniden sırala
router.post('/reorder', verifyToken, async (req, res) => {
  try {
    const { order } = req.body; // [{id: '...', priority: 1}, ...]
    
    for (const item of order) {
      await FeaturedProduct.findByIdAndUpdate(item.id, { priority: item.priority });
    }
    
    res.json({ message: 'Sıralama güncellendi' });
  } catch (error) {
    res.status(500).json({ message: 'Sıralama güncellenirken hata oluştu', error: error.message });
  }
});

export default router;

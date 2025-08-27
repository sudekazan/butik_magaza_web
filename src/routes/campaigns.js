import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Campaign from '../models/Campaign.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import verifyToken from '../middleware/auth.js';

const router = Router();

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9\-]/gi, '_');
    cb(null, `campaign_${Date.now()}_${base}${ext}`);
  }
});

const upload = multer({ storage });

// Tüm kampanyaları listele (public)
router.get('/', async (req, res) => {
  try {
    // Süresi dolmuş kampanyaları otomatik pasif yap
    await Campaign.updateExpiredCampaigns();
    
    const campaigns = await Campaign.find({ isActive: true })
      .populate('targetId', 'name')
      .populate('productIds', 'name imageUrl price')
      .sort({ priority: -1, createdAt: -1 });
    
    res.json(campaigns);
  } catch (err) {
    console.error('Kampanyalar listelenirken hata:', err);
    res.status(500).json({ message: 'Kampanyalar alınamadı' });
  }
});

// Admin için tüm kampanyaları listele
router.get('/admin/all', verifyToken, async (req, res) => {
  try {
    // Süresi dolmuş kampanyaları otomatik pasif yap
    await Campaign.updateExpiredCampaigns();
    
    const campaigns = await Campaign.find()
      .populate('targetId', 'name')
      .populate('productIds', 'name imageUrl price')
      .sort({ createdAt: -1 });
    
    res.json(campaigns);
  } catch (err) {
    console.error('Admin kampanyalar listelenirken hata:', err);
    res.status(500).json({ message: 'Kampanyalar alınamadı' });
  }
});

// Tekil kampanya getir
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id)
      .populate('targetId', 'name')
      .populate('productIds', 'name imageUrl price');
    
    if (!campaign) {
      return res.status(404).json({ message: 'Kampanya bulunamadı' });
    }
    
    res.json(campaign);
  } catch (err) {
    console.error('Kampanya getirilirken hata:', err);
    res.status(500).json({ message: 'Kampanya alınamadı' });
  }
});

// Kampanya ekle
router.post('/', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { 
      name, 
      description, 
      startDate, 
      endDate, 
      type, 
      targetId, 
      productIds, 
      discount,
      priority 
    } = req.body;
    
    if (!name || !startDate || !endDate || !type) {
      return res.status(400).json({ 
        message: 'name, startDate, endDate ve type zorunludur' 
      });
    }
    
    // Tarih validasyonu
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ 
        message: 'Bitiş tarihi başlangıç tarihinden sonra olmalıdır' 
      });
    }
    
    // Kampanya tipine göre validasyon
    if (type === 'category') {
      if (!targetId) {
        return res.status(400).json({ 
          message: 'Kategori kampanyası için targetId zorunludur' 
        });
      }
      
      // Kategori var mı kontrol et
      const category = await Category.findById(targetId);
      if (!category) {
        return res.status(400).json({ message: 'Kategori bulunamadı' });
      }
    } else if (type === 'products') {
      if (!productIds || !Array.isArray(JSON.parse(productIds)) || JSON.parse(productIds).length === 0) {
        return res.status(400).json({ 
          message: 'Ürün kampanyası için en az bir ürün seçilmelidir' 
        });
      }
      
      // Ürünler var mı kontrol et
      const productIdsArray = JSON.parse(productIds);
      const products = await Product.find({ _id: { $in: productIdsArray } });
      if (products.length !== productIdsArray.length) {
        return res.status(400).json({ message: 'Bazı ürünler bulunamadı' });
      }
    }
    
    const campaignData = {
      name,
      description: description || '',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      type,
      discount: Number(discount) || 0,
      priority: Number(priority) || 1,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : ''
    };
    
    if (type === 'category') {
      campaignData.targetId = targetId;
    } else if (type === 'products') {
      campaignData.productIds = JSON.parse(productIds);
    }
    
    const campaign = await Campaign.create(campaignData);
    
    // Populate ile detayları getir
    await campaign.populate('targetId', 'name');
    await campaign.populate('productIds', 'name imageUrl price');
    
    res.status(201).json(campaign);
  } catch (err) {
    console.error('Kampanya eklenirken hata:', err);
    res.status(500).json({ message: 'Kampanya eklenemedi' });
  }
});

// Kampanya güncelle
router.put('/:id', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      startDate, 
      endDate, 
      type, 
      targetId, 
      productIds, 
      discount,
      priority,
      isActive 
    } = req.body;
    
    const update = {};
    
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (startDate !== undefined) update.startDate = new Date(startDate);
    if (endDate !== undefined) update.endDate = new Date(endDate);
    if (type !== undefined) update.type = type;
    if (discount !== undefined) update.discount = Number(discount);
    if (priority !== undefined) update.priority = Number(priority);
    if (isActive !== undefined) update.isActive = isActive === 'true';
    
    // Tarih validasyonu
    if (update.startDate && update.endDate && update.startDate >= update.endDate) {
      return res.status(400).json({ 
        message: 'Bitiş tarihi başlangıç tarihinden sonra olmalıdır' 
      });
    }
    
    // Kampanya tipine göre güncelleme
    if (type === 'category' || targetId !== undefined) {
      if (type === 'category' && targetId) {
        const category = await Category.findById(targetId);
        if (!category) {
          return res.status(400).json({ message: 'Kategori bulunamadı' });
        }
        update.targetId = targetId;
        update.productIds = [];
      }
    } else if (type === 'products' || productIds !== undefined) {
      if (productIds) {
        const productIdsArray = JSON.parse(productIds);
        const products = await Product.find({ _id: { $in: productIdsArray } });
        if (products.length !== productIdsArray.length) {
          return res.status(400).json({ message: 'Bazı ürünler bulunamadı' });
        }
        update.productIds = productIdsArray;
        update.targetId = null;
      }
    }
    
    // Görsel güncelleme
    if (req.file) {
      update.imageUrl = `/uploads/${req.file.filename}`;
    }
    
    const campaign = await Campaign.findByIdAndUpdate(
      id, 
      update, 
      { new: true, runValidators: true }
    ).populate('targetId', 'name').populate('productIds', 'name imageUrl price');
    
    if (!campaign) {
      return res.status(404).json({ message: 'Kampanya bulunamadı' });
    }
    
    res.json(campaign);
  } catch (err) {
    console.error('Kampanya güncellenirken hata:', err);
    res.status(500).json({ message: 'Kampanya güncellenemedi' });
  }
});

// Kampanya sil
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findByIdAndDelete(id);
    
    if (!campaign) {
      return res.status(404).json({ message: 'Kampanya bulunamadı' });
    }
    
    res.json({ message: 'Kampanya başarıyla silindi' });
  } catch (err) {
    console.error('Kampanya silinirken hata:', err);
    res.status(500).json({ message: 'Kampanya silinemedi' });
  }
});

export default router;

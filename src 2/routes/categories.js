import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Buffer } from 'buffer';
import cloudinary from '../config/cloudinary.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import verifyToken from '../middleware/auth.js';

const router = Router();

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadBufferToCloudinary = async (buffer, mimetype, folder) => {
  const dataUri = `data:${mimetype || 'image/jpeg'};base64,${Buffer.from(buffer).toString('base64')}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder: folder,
    resource_type: 'image',
    use_filename: true,
    unique_filename: true
  });
  return res;
};

const toSlug = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Listele
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    console.error('Kategoriler listelenirken hata:', err);
    res.status(500).json({ message: 'Kategoriler alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Slug ile tekil kategori getir
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ message: 'Kategori slug gerekli' });
    const category = await Category.findOne({ slug });
    if (!category) return res.status(404).json({ message: 'Kategori bulunamadı' });
    res.json(category);
  } catch (err) {
    console.error('Kategori (slug) getirilirken hata:', err);
    res.status(500).json({ message: 'Kategori alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Tekil kategori getir
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Kategori ID gerekli' });
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: 'Kategori bulunamadı' });
    res.json(category);
  } catch (err) {
    console.error('Kategori getirilirken hata:', err);
    res.status(500).json({ message: 'Kategori alınamadı', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Ekle
router.post('/', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Kategori adı zorunlu' });
    
    const slug = toSlug(name);
    const exists = await Category.findOne({ $or: [{ name }, { slug }] });
    if (exists) return res.status(409).json({ message: 'Kategori zaten mevcut' });
    let imageUrl = '';
    if (req.file && req.file.buffer) {
      try {
        const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/categories';
        const r = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, folder);
        imageUrl = r.secure_url;
      } catch (e) {
        console.error('Cloudinary kategori yükleme hatası:', e);
      }
    }
    const created = await Category.create({ name, slug, imageUrl });
    res.status(201).json(created);
  } catch (err) {
    console.error('Kategori eklenirken hata:', err);
    res.status(500).json({ message: 'Kategori eklenemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Güncelle
router.put('/:id', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!id) return res.status(400).json({ message: 'Kategori ID gerekli' });
    
    const update = {};
    if (name) {
      update.name = name;
      update.slug = toSlug(name);
    }
    if (req.file && req.file.buffer) {
      try {
        const folder = process.env.CLOUDINARY_FOLDER || 'butik-magaza/categories';
        const r = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, folder);
        update.imageUrl = r.secure_url;
      } catch (e) {
        console.error('Cloudinary kategori güncelleme yükleme hatası:', e);
      }
    }
    
    const prev = await Category.findById(id);
    if (!prev) return res.status(404).json({ message: 'Kategori bulunamadı' });
    
    // Eski local resim varsa ve yeni Cloudinary yüklendiyse, yerel dosyayı tutmaya gerek yok
    
    const updated = await Category.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ message: 'Kategori bulunamadı' });
    res.json(updated);
  } catch (err) {
    console.error('Kategori güncellenirken hata:', err);
    res.status(500).json({ message: 'Kategori güncellenemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// Sil
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Kategori ID gerekli' });
    
    // Önce bu kategorideki tüm ürünleri sil
    const deletedProducts = await Product.deleteMany({ categoryId: id });
    console.log(`${deletedProducts.deletedCount} ürün silindi`);
    
    // Sonra kategoriyi sil
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Kategori bulunamadı' });
    
    res.json({ 
      success: true, 
      message: `Kategori ve ${deletedProducts.deletedCount} ürün başarıyla silindi`,
      deletedProducts: deletedProducts.deletedCount
    });
  } catch (err) {
    console.error('Kategori silinirken hata:', err);
    res.status(500).json({ message: 'Kategori silinemedi', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

export default router;


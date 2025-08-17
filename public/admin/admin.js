// Auth guard
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/admin/login.html';
}

// Arama ve filtreleme için global değişkenler
let allProducts = []; // Tüm ürünler
let filteredProducts = []; // Filtrelenmiş ürünler
let currentSearchQuery = '';
let currentCategoryFilter = '';
let currentStockFilter = '';
let currentSortBy = 'name';

// Cropper.js kontrolü ve fallback
const checkCropperAvailability = () => {
  // Cropper.js yüklenene kadar bekle
  if (typeof Cropper === 'undefined') {
    // Daha kısa süre bekle ve birkaç kez kontrol et
    return new Promise((resolve) => {
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        if (typeof Cropper !== 'undefined') {
          clearInterval(checkInterval);
          console.log('Cropper.js başarıyla yüklendi');
          resolve(true);
        } else if (attempts >= 20) { // 20 × 100ms = 2 saniye max
          clearInterval(checkInterval);
          console.warn('Cropper.js yüklenemedi! Görsel kırpma özelliği devre dışı.');
          resolve(false);
        }
      }, 100); // 100ms aralıklarla kontrol et
    });
  }
  return Promise.resolve(true);
};

// Basit kırpma fallback (Cropper.js yoksa)
const simpleCropFallback = (file, { aspectRatio = 4/3, onDone, onError } = {}) => {
  const url = URL.createObjectURL(file);
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
      <div class="text-center">
        <h3 class="text-lg font-semibold mb-4">Görsel Kırpma</h3>
        <p class="text-sm text-slate-500 mb-4">Cropper.js yüklenemedi. Görsel olduğu gibi kullanılacak.</p>
        <div class="flex gap-3 justify-center">
          <button id="cropCancel" class="px-4 py-2 border rounded">Vazgeç</button>
          <button id="cropSave" class="px-4 py-2 rounded text-white" style="background:linear-gradient(135deg,#CBA135,#E3C77E)">Kullan</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const close = () => { URL.revokeObjectURL(url); modal.remove(); };
  modal.querySelector('#cropCancel').onclick = close;
  modal.querySelector('#cropSave').onclick = () => { onDone?.(file); close(); };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
};

// Token geçerliliğini kontrol et
const checkTokenValidity = async () => {
  try {
    const res = await fetch('/api/health', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) {
      alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
      localStorage.removeItem('token');
      window.location.href = '/admin/login.html';
      return false;
    }
    return true;
  } catch (error) {
    console.error('Token kontrol hatası:', error);
    return false;
  }
};

// Sidebar nav
const navItems = document.querySelectorAll('.tab-btn');
const sections = {
  categories: document.getElementById('tab-categories'),
  products: document.getElementById('tab-products'),
  campaigns: document.getElementById('tab-campaigns'),
  featured: document.getElementById('tab-featured'),
  settings: document.getElementById('tab-settings')
};
navItems.forEach((btn) =>
  btn.addEventListener('click', () => {
    navItems.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(sections).forEach((s) => s?.classList.add('hidden'));
    const targetSection = document.getElementById(`tab-${btn.dataset.tab}`);
    if (targetSection) targetSection.classList.remove('hidden');
  })
);

// Bu elementler HTML'de bulunmadığı için kaldırıldı
// Topbar profile menu
// document.getElementById('profileBtn')?.addEventListener('click', () => {
//   document.getElementById('profileMenu').classList.toggle('hidden');
// });

// Sidebar toggle (mobile)
// document.getElementById('sidebarToggle')?.addEventListener('click', () => {
//   const sidebar = document.getElementById('sidebar');
//   if (sidebar.classList.contains('hidden')) {
//     sidebar.classList.remove('hidden');
//     sidebar.classList.add('absolute', 'z-50', 'h-screen');
//   } else {
//     sidebar.classList.add('hidden');
//     sidebar.classList.remove('absolute', 'z-50', 'h-screen');
//   }
// });

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/admin/login.html';
});

const authFetch = async (url, options = {}) => {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
    
    if (res.status === 401) {
      // Oturum süresi dolmuş
      alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
      localStorage.removeItem('token');
      window.location.href = '/admin/login.html';
      return null;
    }
    
    return res; // Response nesnesini döndür, JSON parse etme
  } catch (error) {
    console.error('authFetch hatası:', error);
    return null;
  }
};

// Categories - DOM yüklendikten sonra atanacak
let catForm;
let catList;
let prodCatSelect;

// Products
// Bu değişkenler global olarak tanımlanacak

// Image management elements - DOM yüklendikten sonra atanacak
let catImageInput;
let catImagePreview;
let catDropZone;
let catImageControls;
let pickCatImageBtn;
let removeCatImageBtn;
let editCatImageBtn;
let catImageSize;
let catImageDimensions;

// Product image management elements
const prodImageInput = document.getElementById('prodImageInput');
const dropZone = document.getElementById('dropZone');
const imageControls = document.getElementById('imageControls');
const pickImageBtn = document.getElementById('pickImageBtn');
// Çoklu görsel desteği için bu elementler kaldırıldı
// const imagePreview = document.getElementById('imagePreview');
// const removeImageBtn = document.getElementById('removeImageBtn');
// const editImageBtn = document.getElementById('editImageBtn');
// const cropImageBtn = document.getElementById('cropImageBtn');
// const imageSize = document.getElementById('imageSize');
// const imageDimensions = document.getElementById('imageDimensions');

// Global variables
let editingProductId = null;

// Global değişkenler
let productImages = [];
let catCroppedFile = null;
let variantImageMap = new Map(); // Varyant görsel dosyaları için global harita
let prodForm = null; // Ürün formu global referansı
let variantsContainer = null; // Varyant konteyner global referansı
let sizeStocksContainer = null; // Beden stok konteyner global referansı
let prodModal = null; // Ürün modal global referansı

// Global fonksiyonlar
let openProductModal = null;
let closeProductModal = null;
let addVariant = null;
let addSizeRow = null;

// Görsel render fonksiyonları - global olarak tanımlanıyor
const renderProductImages = () => {
  const container = document.getElementById('productImagesContainer');
  if (!container) return;
  
  if (productImages.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400 text-center">Henüz görsel eklenmedi</p>';
    return;
  }
  
  // Önce container'ı temizle
  container.innerHTML = '';
  
  // Her görsel için DOM elementi oluştur
  productImages.forEach(img => {
    const imageDiv = document.createElement('div');
    imageDiv.className = 'flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-white';
    
    // Görsel URL'ini güvenli şekilde al
    let imageSrc = '';
    if (img.file) {
      imageSrc = URL.createObjectURL(img.file);
    } else if (img.url) {
      imageSrc = img.url;
    } else {
      imageSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0zMiAyNEMyNy41ODE3IDI0IDI0IDI3LjU4MTcgMjQgMzJDMjQgMzYuNDE4MyAyNy41ODE3IDQwIDMyIDQwQzM2LjQxODMgNDAgNDAgMzYuNDE4MyA0MCAzMkM0MCAyNy41ODE3IDM2LjQxODMgMjQgMzIgMjRaIiBmaWxsPSIjOUI5QkEwIi8+Cjwvc3ZnPgo=';
    }
    
    imageDiv.innerHTML = `
      <div class="flex-shrink-0">
        <img src="${imageSrc}" alt="${img.name}" class="w-16 h-16 object-cover rounded-lg" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-slate-800 truncate">${img.name}</p>
        <p class="text-xs text-slate-500">${img.file ? formatFileSize(img.size) : 'Mevcut görsel'}</p>
        <div class="flex items-center gap-2 mt-1">
          <button type="button" class="text-xs px-2 py-1 rounded ${img.isMain ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} main-btn">
            ${img.isMain ? '✓ Ana Görsel' : 'Ana Yap'}
          </button>
          <button type="button" class="text-xs px-2 py-1 rounded bg-rose-100 text-rose-600 hover:bg-rose-200 remove-btn">
            Kaldır
          </button>
        </div>
      </div>
    `;
    
    // Event listener'ları ekle
    const mainBtn = imageDiv.querySelector('.main-btn');
    const removeBtn = imageDiv.querySelector('.remove-btn');
    
    if (mainBtn) {
      mainBtn.addEventListener('click', () => setMainImage(img.id));
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', () => removeProductImage(img.id));
    }
    
    container.appendChild(imageDiv);
  });
};



// Yardımcı fonksiyonlar
const setMainImage = (imageId) => {
  productImages.forEach(img => img.isMain = img.id === imageId);
  renderProductImages();
};

const removeProductImage = (imageId) => {
  const index = productImages.findIndex(img => img.id === imageId);
  if (index !== -1) {
    productImages.splice(index, 1);
    // Eğer ana görsel silindiyse, ilk görseli ana yap
    if (productImages.length > 0 && !productImages.some(img => img.isMain)) {
      productImages[0].isMain = true;
    }
    renderProductImages();
    updateImageControls();
  }
};

const clearProductImages = () => {
  productImages = [];
  renderProductImages();
  updateImageControls();
};

// Drag & Drop utility (tekil ve global)
const setupDragAndDrop = (targetDropZone, targetInput, afterAssignCallback) => {
  if (!targetDropZone || !targetInput) return;

  ['dragenter', 'dragover'].forEach((evt) => {
    targetDropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      targetDropZone.classList.add('ring-2', 'ring-[#CBA135]');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    targetDropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      targetDropZone.classList.remove('ring-2', 'ring-[#CBA135]');
    });
  });

  targetDropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type?.startsWith('image/')) {
      targetInput.files = e.dataTransfer.files;
      if (typeof afterAssignCallback === 'function') {
        afterAssignCallback({ target: targetInput });
      }
    }
  });
};

 

// Image management functions
const setupImageManagement = () => {
  // Category image management
  pickCatImageBtn?.addEventListener('click', () => catImageInput.click());
  catImageInput?.addEventListener('change', handleCatImageSelect);
  removeCatImageBtn?.addEventListener('click', removeCatImage);
  editCatImageBtn?.addEventListener('click', editCatImage);
  
  // Product image management
  pickImageBtn?.addEventListener('click', () => prodImageInput.click());
  prodImageInput?.addEventListener('change', handleProdImageSelect);
  // Çoklu görsel desteği için bu event listener'lar kaldırıldı
  // removeImageBtn?.addEventListener('click', removeProdImage);
  // editImageBtn?.addEventListener('click', editProdImage);
  // cropImageBtn?.addEventListener('click', cropProdImage);
  
  // Setup drag and drop for main drop zones
  setupDragAndDrop(dropZone, prodImageInput, (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Her dosya için kırpma modalı aç
    files.forEach((file, index) => {
      openCropperModal(file, {
        aspectRatio: getProductCardAspectRatio(),
        onDone: (blob) => {
          const croppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
          addProductImage(croppedFile);
          
          // Son dosya işlendikten sonra input'u temizle
          if (index === files.length - 1) {
            prodImageInput.value = '';
          }
        }
      });
    });
  });
  
  // Setup drag and drop for category images
  setupDragAndDrop(catDropZone, catImageInput, (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    openCropperModal(file, {
      aspectRatio: getCategoryCardAspectRatio(),
      onDone: (blob) => {
        const newFile = replaceInputFile(catImageInput, file.name, blob);
        displayImagePreview(newFile, catImagePreview, catImageControls, catImageSize, catImageDimensions);
      }
    });
  });
};

let prodCroppedFile = null;

// Kategori seçimi
const handleCatImageSelect = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const ar = getCategoryCardAspectRatio(); // otomatik oran
  openCropperModal(file, {
    aspectRatio: ar,
    onDone: (blob) => {
      catCroppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
      replaceInputFile(catImageInput, file.name, blob);
      displayImagePreview(catCroppedFile, catImagePreview, catImageControls, catImageSize, catImageDimensions);
    }
  });
};

// Ürün seçimi - Çoklu görsel desteği
const handleProdImageSelect = (event) => {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;
  
  // Her dosya için kırpma modalı aç
  files.forEach((file, index) => {
    const ar = getProductCardAspectRatio(); // otomatik/fallback oran
    openCropperModal(file, {
      aspectRatio: ar,
      onDone: (blob) => {
        const croppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
        addProductImage(croppedFile);
        
        // Son dosya işlendikten sonra input'u temizle
        if (index === files.length - 1) {
          prodImageInput.value = '';
        }
      }
    });
  });
};

const displayImagePreview = (file, previewElement, controlsElement, sizeElement, dimensionsElement) => {
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    previewElement.src = e.target.result;
    previewElement.classList.remove('hidden');
    controlsElement.classList.remove('hidden');
    
    // Display file info
    sizeElement.textContent = formatFileSize(file.size);
    
    const img = new Image();
    img.onload = () => {
      dimensionsElement.textContent = `${img.width} x ${img.height}px`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const removeCatImage = () => {
  catImageInput.value = '';
  catImagePreview.classList.add('hidden');
  catImageControls.classList.add('hidden');
  catImagePreview.src = '';
  // Kırpılmış görsel dosyasını da temizle
  catCroppedFile = null;
};

// Çoklu görsel yönetimi fonksiyonları
const addProductImage = (file) => {
  if (!file || !(file instanceof File)) {
    console.error('Geçersiz dosya:', file);
    return;
  }
  
  const imageId = Date.now() + Math.random();
  const imageData = {
    id: imageId,
    file: file,
    name: file.name || 'Görsel',
    size: file.size || 0,
    isMain: productImages.length === 0 // İlk eklenen ana görsel
  };
  
  productImages.push(imageData);
  
  try {
    renderProductImages();
    updateImageControls();
  } catch (error) {
    console.error('Görsel render hatası:', error);
  }
  
  // Kullanıcıya bilgi ver
  console.log(`Görsel eklendi: ${file.name}`);
};



const updateImageControls = () => {
  const controls = document.getElementById('imageControls');
  if (!controls) return;
  
  if (productImages.length > 0) {
    controls.classList.remove('hidden');
    controls.innerHTML = `
      <div class="text-xs text-slate-500">
        <p>Eklenen görsel sayısı: <strong>${productImages.length}</strong></p>
        <p>Ana görsel: <strong>${productImages.find(img => img.isMain)?.name || 'Belirlenmedi'}</strong></p>
        <p>Önerilen boyut: 1200x1000px (6:5 oran)</p>
        <p>İlk eklenen görsel ana görsel olarak kullanılır</p>
      </div>
    `;
  } else {
    controls.classList.add('hidden');
  }
};

const removeProdImage = () => {
  prodImageInput.value = '';
  // Çoklu görsel desteği için tüm görselleri temizle
  productImages = [];
  renderProductImages();
  updateImageControls();
};

const editCatImage = () => {
  // Open image editor (basic implementation)
  if (catImageInput.files[0]) {
    openImageEditor(catImageInput.files[0], (editedImage) => {
      // Handle edited image
      console.log('Edited category image:', editedImage);
    });
  }
};

// Bu fonksiyonlar çoklu görsel desteği için kaldırıldı
// const editProdImage = () => {
//   // Open image editor (basic implementation)
//   if (prodImageInput.files[0]) {
//     openImageEditor(prodImageInput.files[0], (editedImage) => {
//       // Handle edited image
//       console.log('Edited product image:', editedImage);
//     });
//   }
// };

// const cropProdImage = () => {
//   // Open image cropper (basic implementation)
//   if (prodImageInput.files[0]) {
//     openImageEditor(prodImageInput.files[0], (croppedImage) => {
//       // Handle cropped image
//       console.log('Cropped product image:', croppedImage);
//     });
//   }
// };

// Bu fonksiyonlar çoklu görsel desteği için kaldırıldı
// const openImageEditor = (file, callback) => {
//   // Basic image editor implementation
//   const canvas = document.createElement('canvas');
//   const ctx = canvas.getContext('2d');
//   const img = new Image();
//   
//   img.onload = () => {
//     canvas.width = img.width;
//     canvas.height = img.height;
//     ctx.drawImage(img, 0, 0);
//   
//     // Show editor modal
//     showImageEditorModal(canvas, callback);
//   };
//   
//   img.src = URL.createObjectURL(file);
// };

// const openImageCropper = (file, callback) => {
//   // Basic image cropper implementation
//   const img = new Image();
//   img.src = URL.createObjectURL(file);
// };

// Bu modal fonksiyonları çoklu görsel desteği için kaldırıldı
// const showImageEditorModal = (canvas, callback) => {
//   // Basic image editor modal implementation...
// };

// const showImageCropperModal = (img, callback) => {
//   // Basic image cropper modal implementation...
// };

// Bu fonksiyon çoklu görsel desteği için kaldırıldı
// const updateImageInfo = (imageUrl) => {
//   const img = new Image();
//   img.onload = () => {
//     imageDimensions.textContent = `${img.width} x ${img.height}px`;
//     // For existing images, we can't get file size, so show dimensions only
//     imageSize.textContent = 'Mevcut görsel';
//   };
//   img.onerror = () => {
//     imageDimensions.textContent = 'Bilinmiyor';
//     imageSize.textContent = 'Mevcut görsel';
//   };
//   img.src = imageUrl;
// };



// Category edit modal functions
const openCategoryEditModal = async (categoryId) => {
  try {
    const response = await fetch(`/api/categories/${categoryId}`);
    const category = await response.json();
    
    if (!response.ok) {
      alert('Kategori bilgisi yüklenemedi');
      return;
    }
    
    showCategoryEditModal(category);
  } catch (error) {
    console.error('Kategori yüklenirken hata:', error);
    alert('Kategori bilgisi yüklenemedi');
  }
};

const showCategoryEditModal = (category) => {
  // Create modal HTML
  const modalHTML = `
    <div id="catEditModal" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div class="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Kategori Düzenle</h3>
          <button id="closeCatEditModal" class="p-2 rounded-lg hover:bg-slate-100" aria-label="Kapat">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="catEditForm" class="space-y-4">
          <input type="hidden" name="categoryId" value="${category._id}" />
          <div>
            <label class="block text-sm text-slate-700 mb-1">Kategori Adı</label>
            <input name="name" value="${category.name}" required class="w-full rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm text-slate-700 mb-1">Mevcut Görsel</label>
            <div class="mb-3">
              <img src="${category.imageUrl || 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop'}" 
                   alt="${category.name}" 
                   class="w-32 h-20 object-cover rounded-lg border" />
            </div>
            <label class="block text-sm text-slate-700 mb-1">Yeni Görsel (Opsiyonel)</label>
            <div id="catEditDropZone" class="rounded-xl border border-dashed border-slate-300 p-4 text-center hover:border-[#CBA135] transition bg-white">
              <input id="catEditImageInput" name="image" type="file" accept="image/*" class="hidden" />
              <p class="text-sm text-slate-500">Görseli sürükleyip bırakın veya <button type="button" id="pickCatEditImageBtn" class="text-[#CBA135] underline">dosya seçin</button></p>
              <img id="catEditImagePreview" class="mt-3 max-h-32 mx-auto rounded-lg hidden" />
            </div>
            <div id="catEditImageControls" class="hidden space-y-2 mt-2">
              <div class="flex items-center gap-2">
                <button type="button" id="removeCatEditImageBtn" class="px-3 py-1.5 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">Görseli Kaldır</button>
              </div>
              <div class="text-xs text-slate-500">
                <p>Görsel boyutu: <span id="catEditImageSize">-</span></p>
                <p>Görsel boyutları: <span id="catEditImageDimensions">-</span></p>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 mt-6">
            <button type="button" id="cancelCatEditBtn" class="px-4 py-2 rounded-xl border">Vazgeç</button>
            <button type="submit" class="px-5 py-2 rounded-xl text-white shadow hover:shadow-md" style="background: linear-gradient(135deg,#CBA135,#E3C77E);">Güncelle</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  // Add modal to DOM
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Setup event listeners
  const modal = document.getElementById('catEditModal');
  const closeBtn = document.getElementById('closeCatEditModal');
  const cancelBtn = document.getElementById('cancelCatEditBtn');
  const form = document.getElementById('catEditForm');
  const imageInput = document.getElementById('catEditImageInput');
  const imagePreview = document.getElementById('catEditImagePreview');
  const imageControls = document.getElementById('catEditImageControls');
  const pickBtn = document.getElementById('pickCatEditImageBtn');
  const removeBtn = document.getElementById('removeCatEditImageBtn');
  const sizeSpan = document.getElementById('catEditImageSize');
  const dimensionsSpan = document.getElementById('catEditImageDimensions');
  
  // Close modal
  const closeModal = () => {
    modal.remove();
  };
  
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Image handling
  pickBtn.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // Kategori düzenleme modalında da kırpma modalı aç
      openCropperModal(file, {
        aspectRatio: getCategoryCardAspectRatio(),
        onDone: (blob) => {
          catCroppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
          replaceInputFile(imageInput, file.name, blob);
          displayImagePreview(catCroppedFile, imagePreview, imageControls, sizeSpan, dimensionsSpan);
        }
      });
    }
  });
  
  removeBtn.addEventListener('click', () => {
    imageInput.value = '';
    imagePreview.classList.add('hidden');
    imageControls.classList.add('hidden');
    imagePreview.src = '';
    // Kırpılmış görsel dosyasını da temizle
    catCroppedFile = null;
  });
  
  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    const categoryId = formData.get('categoryId');
    
    // Kırpılmış görsel dosyasını FormData'ya ekle
    if (catCroppedFile) {
      formData.set('image', catCroppedFile);
    }
    
    try {
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      
      if (res.status === 401) {
        alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
        localStorage.removeItem('token');
        window.location.href = '/admin/login.html';
        return;
      }
      
      if (!res.ok) {
        alert('Kategori güncellenemedi');
        return;
      }
      
      alert('Kategori başarıyla güncellendi!');
      closeModal();
      // Kırpılmış görsel dosyasını temizle
      catCroppedFile = null;
      await loadCategories();
      
    } catch (error) {
      console.error('Kategori güncellenirken hata:', error);
      alert('Kategori güncellenemedi');
    }
  });
  
  // Setup drag and drop for edit modal
  const editDropZone = document.getElementById('catEditDropZone');
  setupDragAndDrop(editDropZone, imageInput, (e) => {
    const file = e.target.files[0];
    if (file) {
      // Kategori düzenleme modalında da kırpma modalı aç
      openCropperModal(file, {
        aspectRatio: getCategoryCardAspectRatio(),
        onDone: (blob) => {
          catCroppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
          replaceInputFile(imageInput, file.name, blob);
          displayImagePreview(catCroppedFile, imagePreview, imageControls, sizeSpan, dimensionsSpan);
        }
      });
    }
  });
};

const loadCategories = async () => {
  try {
    const res = await fetch('/api/categories');
    if (res.status === 401) {
      alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
      localStorage.removeItem('token');
      window.location.href = '/admin/login.html';
      return;
    }
    const cats = await res.json();
    
    console.log('Yüklenen kategoriler:', cats);
    
    // render select
    if (prodCatSelect) {
      prodCatSelect.innerHTML = cats.map((c) => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    
    // render grid cards
    if (catList) {
      catList.innerHTML = '';
      cats.forEach((c) => {
        const card = document.createElement('div');
        const img = c.imageUrl || 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
        card.className = 'group relative overflow-hidden rounded-xl shadow hover:shadow-lg transition';
        card.innerHTML = `
          <div class="aspect-[5/6] overflow-hidden">
            <img src="${img}" alt="${c.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div class="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
              ${c.imageUrl ? 'Özel Görsel' : 'Varsayılan'}
            </div>
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          <div class="absolute inset-x-0 bottom-0 p-3 flex items-center justify-between">
            <div class="text-white font-semibold">${c.name}</div>
            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
              <button title="Düzenle" data-id="${c._id}" class="cat-edit p-2 rounded-full bg-white/90 hover:bg-white shadow">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
              <button title="Sil" data-id="${c._id}" class="cat-del p-2 rounded-full bg-white/90 hover:bg-white shadow">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 7h12v2H6V7zm2 3h8l-1 9H9l-1-9zM9 4h6l1 2H8l1-2z"/></svg>
              </button>
            </div>
          </div>
        `;
        catList.appendChild(card);
      });

      // actions
      catList.querySelectorAll('.cat-del').forEach((btn) =>
        btn.addEventListener('click', async () => {
          if (!confirm('Bu kategoriyi silmek istediğinize emin misiniz? Bu işlem kategorideki TÜM ürünleri de silecektir!')) return;
          
          try {
            const response = await authFetch(`/api/categories/${btn.dataset.id}`, { method: 'DELETE' });
            const result = await response.json();
            
            if (result.success) {
              alert(`Kategori başarıyla silindi!\n${result.message}`);
            } else {
              alert('Kategori silinirken bir hata oluştu.');
            }
          } catch (error) {
            console.error('Kategori silinirken hata:', error);
            alert('Kategori silinirken bir hata oluştu.');
          }
          
          await loadCategories();
          await loadProducts();
        })
      );
      catList.querySelectorAll('.cat-edit').forEach((btn) =>
        btn.addEventListener('click', async () => {
          openCategoryEditModal(btn.dataset.id);
        })
      );
    } else {
      console.error('catList element bulunamadı');
    }
  } catch (error) {
    console.error('Kategoriler yüklenirken hata:', error);
  }
};

// Kategori form submit event listener'ı DOMContentLoaded içinde tanımlanacak

// Products - Elementler DOMContentLoaded içinde tanımlanıyor

// Modal fonksiyonları DOMContentLoaded içinde tanımlanacak

// Event listener'ları güvenli şekilde ekle

// SizeStocks dynamic rows - DOMContentLoaded içinde tanımlanacak

// Color Variants dynamic rows

// Renk varyantından yeni ürün oluşturma fonksiyonu
const createProductFromColorVariant = (colorRow) => {
  const colorName = colorRow.querySelector('input[name="colorName[]"]').value;
  const colorHex = colorRow.querySelector('input[type="color"]').value;
  const colorImageFile = colorRow.colorImageFile;
  
  if (!colorName.trim()) {
    alert('Lütfen önce renk adını girin');
    return;
  }
  
  if (!colorImageFile) {
    alert('Lütfen önce renk görselini ekleyin');
    return;
  }
  
  // Mevcut ürün bilgilerini al
  const currentProductName = document.querySelector('[name="name"]').value;
  const currentProductDesc = document.querySelector('[name="description"]').value;
  const currentProductPrice = document.querySelector('[name="price"]').value;
  const currentProductCategory = document.getElementById('prodCat').value;
  
  // Yeni ürün için form verilerini hazırla
  const newProductData = {
    name: `${currentProductName} - ${colorName}`,
    description: currentProductDesc,
    price: currentProductPrice,
    category: currentProductCategory,
    colorVariants: [{
      name: colorName,
      hexCode: colorHex,
      imageUrl: '' // Görsel dosya olarak gönderilecek
    }],
    images: [colorImageFile] // Renk görselini ana görsel olarak kullan
  };
  
  // Yeni ürün oluşturma modalını aç
  openNewProductModal(newProductData);
};

// addColorVariant fonksiyonu DOMContentLoaded içinde tanımlanacak

// Event listener'lar DOMContentLoaded içinde tanımlanacak

// Yeni ürün modalı açma fonksiyonu
const openNewProductModal = (productData) => {
  // Yeni ürün oluşturma modalı
  const modalHTML = `
    <div id="newProductModal" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div class="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Yeni Ürün Oluştur</h3>
          <button id="closeNewProductModal" class="p-2 rounded-lg hover:bg-slate-100" aria-label="Kapat">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-700 mb-1">Ürün Adı</label>
            <input id="newProductName" value="${productData.name || ''}" class="w-full rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm text-slate-700 mb-1">Açıklama</label>
            <input id="newProductDesc" value="${productData.description || ''}" class="w-full rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm text-slate-700 mb-1">Fiyat (₺)</label>
            <input id="newProductPrice" type="number" step="0.01" value="${productData.price || ''}" class="w-full rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm text-slate-700 mb-1">Kategori</label>
            <select id="newProductCategory" class="w-full rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2">
              <!-- Kategoriler buraya yüklenecek -->
            </select>
          </div>
          <div class="flex items-center justify-end gap-2 mt-6">
            <button type="button" id="cancelNewProductBtn" class="px-4 py-2 rounded-xl border">Vazgeç</button>
            <button type="button" id="createNewProductBtn" class="px-5 py-2 rounded-xl text-white shadow hover:shadow-md" style="background: linear-gradient(135deg,#CBA135,#E3C77E);">Ürünü Oluştur</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Modal'ı DOM'a ekle
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Event listener'ları ekle
  const modal = document.getElementById('newProductModal');
  const closeBtn = document.getElementById('closeNewProductModal');
  const cancelBtn = document.getElementById('cancelNewProductBtn');
  const createBtn = document.getElementById('createNewProductBtn');
  
  // Kategorileri yükle
  const categorySelect = document.getElementById('newProductCategory');
  if (categorySelect) {
    fetch('/api/categories')
      .then(res => res.json())
      .then(cats => {
        categorySelect.innerHTML = cats.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
        if (productData.category) {
          categorySelect.value = productData.category;
        }
      })
      .catch(err => console.error('Kategoriler yüklenemedi:', err));
  }
  
  // Modal'ı kapat
  const closeModal = () => modal.remove();
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Yeni ürün oluştur
  createBtn.addEventListener('click', async () => {
    const name = document.getElementById('newProductName').value.trim();
    const description = document.getElementById('newProductDesc').value.trim();
    const price = Number(document.getElementById('newProductPrice').value);
    const categoryId = document.getElementById('newProductCategory').value;
    
    if (!name || !price || !categoryId) {
      alert('Lütfen tüm gerekli alanları doldurun');
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      formData.append('price', price);
      formData.append('categoryId', categoryId);
      
      // Renk varyantı görselini ekle
      if (productData.colorVariants && productData.colorVariants.length > 0) {
        const colorVariant = productData.colorVariants[0];
        formData.append('colorVariants', JSON.stringify([colorVariant]));
      }
      
      // Görselleri ekle
      if (productData.images && productData.images.length > 0) {
        formData.append('image', productData.images[0]);
      }
      
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(`Ürün oluşturulamadı: ${errorData.message || 'Bilinmeyen hata'}`);
        return;
      }
      
      alert('Yeni ürün başarıyla oluşturuldu!');
      closeModal();
      await loadProducts();
      
    } catch (error) {
      console.error('Ürün oluşturulurken hata:', error);
      alert('Ürün oluşturulurken bir hata oluştu');
    }
  });
};

// Color variants event listeners - DOMContentLoaded içinde tanımlanacak
// addColorVariantBtn?.addEventListener('click', () => addColorVariant());

const productCard = (p) => {
  const div = document.createElement('div');
  div.className = 'border rounded-xl p-3 space-y-2';
  const img = p.imageUrl || 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
  div.innerHTML = `
    <img src="${img}" class="w-full h-72 object-cover rounded-lg" alt="${p.name}" />
    <div class="flex items-start justify-between">
      <div>
        <div class="font-medium text-slate-800">${p.name}</div>
        <div class="text-sm text-slate-500">${p.size || '-'} • Stok: ${p.stock}</div>
      </div>
      <div class="text-indigo-600 font-semibold">${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(p.price)}</div>
    </div>
    <div class="flex items-center justify-end gap-2 pt-1">
      <button data-id="${p._id}" class="prod-edit text-sm text-indigo-600 hover:text-indigo-800">Düzenle</button>
      <button data-id="${p._id}" class="prod-del text-sm text-rose-600 hover:text-rose-800">Sil</button>
    </div>
  `;
  return div;
};

const renderProductRow = (p) => {
  const tr = document.createElement('tr');
  const img = p.imageUrl || 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
  const hasCustomImage = !!p.imageUrl;
  const isVariant = p.isVariant || false;
  const variantColor = p.variantColor || '';
  
  tr.className = 'hover:bg-slate-50 transition';
  tr.innerHTML = `
    <td class="py-2 pr-4">
      <input type="checkbox" class="product-checkbox rounded border-slate-300 text-[#CBA135] focus:ring-[#CBA135]" value="${p._id}" />
    </td>
    <td class="py-2 pr-4">
      <div class="relative">
        <a href="/product/${p._id}" target="_blank" class="block hover:opacity-80 transition-opacity" title="Ürünü yayınlanmış halinde görüntüle">
        <img src="${img}" class="w-20 h-20 object-cover rounded" />
        </a>
        <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center ${hasCustomImage ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}" title="${hasCustomImage ? 'Özel Görsel' : 'Varsayılan Görsel'}">
          ${hasCustomImage ? '✓' : '!'}
        </div>
        ${isVariant ? `<div class="absolute -bottom-1 -left-1 bg-purple-500 text-white text-xs px-1 py-0.5 rounded-full" title="Varyant Ürün">V</div>` : ''}
      </div>
    </td>
    <td class="py-2 pr-4">
      <div>
        <div class="font-medium">
          <a href="/product/${p._id}" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors" title="Ürünü yayınlanmış halinde görüntüle">
            ${p.name}
          </a>
        </div>
        ${isVariant ? `<div class="text-xs text-purple-600 flex items-center gap-1"><span class="w-3 h-3 rounded-full border" style="background-color: ${p.mainColorHex || '#000000'}"></span>🎨 ${variantColor} varyantı</div>` : ''}
        ${!isVariant && p.mainColor ? `<div class="text-xs text-blue-600 flex items-center gap-1"><span class="w-3 h-3 rounded-full border" style="background-color: ${p.mainColorHex || '#000000'}"></span>${p.mainColor}</div>` : ''}
        ${p.parentProductId ? `<div class="text-xs text-gray-500">Ana ürün varyantı</div>` : ''}
      </div>
    </td>
    <td class="py-2 pr-4">${p.categoryId?.name || '-'}</td>
    <td class="py-2 pr-4">
      ${p.sizeStocks?.length ? 
        `<div class="space-y-1">
          ${p.sizeStocks.map(s => `
            <div class="flex items-center gap-2">
              <span class="text-xs bg-slate-100 px-2 py-1 rounded font-mono">${s.size}</span>
              <span class="text-xs ${Number(s.stock) > 5 ? 'text-green-600' : Number(s.stock) > 0 ? 'text-yellow-600' : 'text-red-600'}">${s.stock}</span>
            </div>
          `).join('')}
        </div>` 
        : (p.size || '-')
      }
    </td>
    <td class="py-2 pr-4">
      <div class="text-center">
        <span class="text-lg font-semibold ${(p.sizeStocks?.reduce((a,s)=>a+Number(s.stock||0),0) || p.stock) > 10 ? 'text-green-600' : (p.sizeStocks?.reduce((a,s)=>a+Number(s.stock||0),0) || p.stock) > 0 ? 'text-yellow-600' : 'text-red-600'}">
          ${p.sizeStocks?.reduce((a,s)=>a+Number(s.stock||0),0) || p.stock}
        </span>
        <div class="text-xs text-gray-500">Toplam</div>
      </div>
    </td>
    <td class="py-2 pr-4">${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(p.price)}</td>
    <td class="py-2 pr-4 text-right">
      <button data-id="${p._id}" class="prod-edit px-2 py-1 rounded-lg border mr-2">Düzenle</button>
      <button data-id="${p._id}" class="prod-del px-2 py-1 rounded-lg border text-rose-600">Sil</button>
    </td>
  `;
  return tr;
};

const loadProducts = async () => {
  try {
    console.log('🔄 loadProducts fonksiyonu başlatıldı');
    
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('❌ Token bulunamadı');
      alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
      window.location.href = '/admin/login.html';
      return;
    }
    
    console.log('🔑 Token mevcut, API çağrısı yapılıyor...');
    const res = await authFetch('/api/products/admin/all');
    
    if (!res) {
      console.error('❌ authFetch null döndürdü');
      return;
    }
    
    console.log('📡 API response alındı, status:', res.status);
    
    if (res.status === 401) {
      console.error('❌ 401 Unauthorized hatası');
      alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
      localStorage.removeItem('token');
      window.location.href = '/admin/login.html';
      return;
    }
    
    if (!res.ok) {
      console.error('❌ API response başarısız, status:', res.status);
      return;
    }
    
    const prods = await res.json();
    console.log('✅ Ürünler başarıyla yüklendi, sayı:', prods.length);
    console.log('📋 İlk ürün örneği:', prods[0]);
    
    // Global ürün listesini güncelle
    allProducts = prods;
    
    // Arama ve filtreleme uygula
    console.log('🔍 applyProductFilters çağrılıyor...');
    applyProductFilters();
    
    // Kategori filtresini güncelle
    console.log('🏷️ updateCategoryFilter çağrılıyor...');
    updateCategoryFilter();
    
    // Scroll pozisyonunu sıfırla
    window.scrollTo(0, 0);
    console.log('✅ Ürünler yüklendikten sonra scroll pozisyonu sıfırlandı');
    
  } catch (error) {
    console.error('❌ loadProducts hatası:', error);
  }
};

// Ayarlar panel kurulumu
const setupSettingsPanel = () => {
  // Sistem bilgilerini güncelle
  updateSystemInfo();
  
  // Form event listener'ları
  setupSettingsForms();
  
  // Tema ayarları
  setupThemeSettings();
};

// Sistem bilgilerini güncelleme
const updateSystemInfo = async () => {
  try {
    // Ürün sayısını al
    const productsRes = await authFetch('/api/products/admin/all');
    if (productsRes) {
      const products = await productsRes.json();
      document.getElementById('totalProducts').textContent = products.length;
    }
    
    // Kategori sayısını al
    const categoriesRes = await fetch('/api/categories');
    const categories = await categoriesRes.json();
    document.getElementById('totalCategories').textContent = categories.length;
  } catch (error) {
    console.error('Sistem bilgileri güncellenirken hata:', error);
  }
};

// Form event listener'ları kurulumu
const setupSettingsForms = () => {
  // Mağaza bilgileri formu
  const storeForm = document.getElementById('storeSettingsForm');
  storeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveStoreSettings();
  });
  
  // SEO ayarları formu
  const seoForm = document.getElementById('seoSettingsForm');
  seoForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSeoSettings();
  });
  
  // Sistem düğmeleri
  document.getElementById('clearCacheBtn')?.addEventListener('click', clearCache);
  document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
};

// Tema ayarları kurulumu
const setupThemeSettings = () => {
  const primaryColor = document.getElementById('primaryColor');
  const primaryColorHex = document.getElementById('primaryColorHex');
  const logoUpload = document.getElementById('logoUpload');
  const selectLogoBtn = document.getElementById('selectLogoBtn');
  const saveThemeBtn = document.getElementById('saveThemeBtn');
  
  // Renk seçici senkronizasyonu
  primaryColor?.addEventListener('input', (e) => {
    primaryColorHex.value = e.target.value;
  });
  
  primaryColorHex?.addEventListener('input', (e) => {
    if (e.target.value.startsWith('#')) {
      primaryColor.value = e.target.value;
    }
  });
  
  // Logo seçme
  selectLogoBtn?.addEventListener('click', () => {
    logoUpload.click();
  });
  
  logoUpload?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const logoPreview = document.getElementById('logoPreview');
        const logoImage = document.getElementById('logoImage');
        logoImage.src = e.target.result;
        logoPreview.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Tema kaydetme
  saveThemeBtn?.addEventListener('click', saveThemeSettings);
};

// Mağaza ayarlarını kaydetme
const saveStoreSettings = () => {
  const formData = {
    storeName: document.getElementById('storeName').value,
    storeDescription: document.getElementById('storeDescription').value,
    storeEmail: document.getElementById('storeEmail').value,
    storePhone: document.getElementById('storePhone').value
  };
  
  // LocalStorage'a kaydet (gerçek uygulamada API'ye gönderilir)
  localStorage.setItem('storeSettings', JSON.stringify(formData));
  
  // Success mesajı
  showSuccessMessage('Mağaza bilgileri başarıyla kaydedildi!');
};

// SEO ayarlarını kaydetme
const saveSeoSettings = () => {
  const formData = {
    metaTitle: document.getElementById('metaTitle').value,
    metaDescription: document.getElementById('metaDescription').value,
    instagramUrl: document.getElementById('instagramUrl').value,
    facebookUrl: document.getElementById('facebookUrl').value
  };
  
  // LocalStorage'a kaydet
  localStorage.setItem('seoSettings', JSON.stringify(formData));
  
  // Success mesajı
  showSuccessMessage('SEO ayarları başarıyla kaydedildi!');
};

// Tema ayarlarını kaydetme
const saveThemeSettings = () => {
  const themeData = {
    primaryColor: document.getElementById('primaryColor').value,
    primaryColorHex: document.getElementById('primaryColorHex').value
  };
  
  // LocalStorage'a kaydet
  localStorage.setItem('themeSettings', JSON.stringify(themeData));
  
  // CSS değişkenlerini güncelle
  document.documentElement.style.setProperty('--primary-color', themeData.primaryColor);
  
  // Success mesajı
  showSuccessMessage('Tema ayarları başarıyla kaydedildi!');
};

// Önbellek temizleme
const clearCache = () => {
  if (confirm('Önbelleği temizlemek istediğinizden emin misiniz?')) {
    localStorage.clear();
    showSuccessMessage('Önbellek başarıyla temizlendi!');
  }
};

// Veri dışa aktarma
const exportData = async () => {
  try {
    const [productsRes, categoriesRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/categories')
    ]);
    
    const products = await productsRes.json();
    const categories = await categoriesRes.json();
    
    const exportData = {
      products,
      categories,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // JSON dosyası olarak indir
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `magaza-verileri-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccessMessage('Veriler başarıyla dışa aktarıldı!');
  } catch (error) {
    console.error('Veri dışa aktarma hatası:', error);
    alert('Veri dışa aktarılırken bir hata oluştu.');
  }
};

// Success mesajı gösterme
const showSuccessMessage = (message) => {
  // Geçici notification div oluştur
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg z-50 transition-all duration-300';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // 3 saniye sonra kaldır
  setTimeout(() => {
    notification.classList.add('opacity-0', 'translate-x-full');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
};

// Kaydedilmiş ayarları yükleme
const loadSavedSettings = () => {
  try {
    // Mağaza ayarları
    const storeSettings = JSON.parse(localStorage.getItem('storeSettings') || '{}');
    if (storeSettings.storeName) {
      document.getElementById('storeName').value = storeSettings.storeName;
      document.getElementById('storeDescription').value = storeSettings.storeDescription || '';
      document.getElementById('storeEmail').value = storeSettings.storeEmail || '';
      document.getElementById('storePhone').value = storeSettings.storePhone || '';
    }
    
    // SEO ayarları
    const seoSettings = JSON.parse(localStorage.getItem('seoSettings') || '{}');
    if (seoSettings.metaTitle) {
      document.getElementById('metaTitle').value = seoSettings.metaTitle;
      document.getElementById('metaDescription').value = seoSettings.metaDescription || '';
      document.getElementById('instagramUrl').value = seoSettings.instagramUrl || '';
      document.getElementById('facebookUrl').value = seoSettings.facebookUrl || '';
    }
    
    // Tema ayarları
    const themeSettings = JSON.parse(localStorage.getItem('themeSettings') || '{}');
    if (themeSettings.primaryColor) {
      document.getElementById('primaryColor').value = themeSettings.primaryColor;
      document.getElementById('primaryColorHex').value = themeSettings.primaryColorHex;
      document.documentElement.style.setProperty('--primary-color', themeSettings.primaryColor);
    }
  } catch (error) {
    console.error('Kaydedilmiş ayarlar yüklenirken hata:', error);
  }
};

// init
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Admin.js DOM yüklendi, başlatılıyor...');
  
  // Ayarlar panelini kur
  setupSettingsPanel();

  // Kaydedilmiş ayarları yükle
  loadSavedSettings();
  
  console.log('🔍 DOM elementleri aranıyor...');
  
  // Elementleri tanımla
  const openProdModal = document.getElementById('openProdModal');
  prodModal = document.getElementById('prodModal'); // Global olarak tanımla
  const closeProdModal = document.getElementById('closeProdModal');
  prodForm = document.getElementById('prodForm'); // Global olarak tanımla
  const prodTableBody = document.getElementById('prodTableBody');
  const addVariantBtn = document.getElementById('addVariantBtn');
  variantsContainer = document.getElementById('variantsContainer'); // Global olarak tanımla
  sizeStocksContainer = document.getElementById('sizeStocksContainer'); // Global olarak tanımla
  const colorVariantsContainer = document.getElementById('colorVariantsContainer');
  const addColorVariantBtn = document.getElementById('addColorVariantBtn');
  const addSizeRowBtn = document.getElementById('addSizeRowBtn');
  
  console.log('📋 Element bulma sonuçları:');
  console.log('  - openProdModal:', !!openProdModal);
  console.log('  - prodModal:', !!prodModal);
  console.log('  - prodForm:', !!prodForm);
  console.log('  - sizeStocksContainer:', !!sizeStocksContainer);
  console.log('  - variantsContainer:', !!variantsContainer);
  
  // Kategori elementleri
  catForm = document.getElementById('catForm');
  catList = document.getElementById('catList');
  prodCatSelect = document.getElementById('prodCat');
  
  // Görsel yönetimi elementleri
  catImageInput = document.getElementById('catImageInput');
  catImagePreview = document.getElementById('catImagePreview');
  catDropZone = document.getElementById('catDropZone');
  catImageControls = document.getElementById('catImageControls');
  pickCatImageBtn = document.getElementById('pickCatImageBtn');
  removeCatImageBtn = document.getElementById('removeCatImageBtn');
  editCatImageBtn = document.getElementById('editCatImageBtn');
  catImageSize = document.getElementById('catImageSize');
  catImageDimensions = document.getElementById('catImageDimensions');
  
  // Element kontrolü - daha detaylı hata raporlama
  const missingElements = [];
  if (!prodModal) missingElements.push('prodModal');
  if (!prodForm) missingElements.push('prodForm');
  if (!sizeStocksContainer) missingElements.push('sizeStocksContainer');
  if (!variantsContainer) missingElements.push('variantsContainer');
  
  if (missingElements.length > 0) {
    console.error('Gerekli DOM elementleri bulunamadı:', missingElements);
    console.error('Bu elementler HTML\'de tanımlanmış mı kontrol edin.');
    
    // Kullanıcıya görsel hata mesajı göster
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed inset-0 bg-red-50 flex items-center justify-center z-50 p-4';
    errorDiv.innerHTML = `
      <div class="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center">
        <div class="text-red-600 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.334 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-red-800 mb-2">Sayfa Yüklenemedi</h3>
        <p class="text-red-600 mb-4">Gerekli sayfa bileşenleri bulunamadı. Lütfen sayfayı yenileyin.</p>
        <button onclick="location.reload()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
          Sayfayı Yenile
        </button>
      </div>
    `;
    document.body.appendChild(errorDiv);
    return;
  }
  
  console.log('Tüm gerekli DOM elementleri başarıyla bulundu');
  
  // Event listener'ları güvenli şekilde ekle
  if (openProdModal) {
    console.log('✅ openProdModal event listener ekleniyor...');
    openProdModal.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('🖱️ Ürün ekleme butonu tıklandı!');
      openProductModal();
    });
  } else {
    console.error('❌ openProdModal bulunamadı!');
  }

  // Debug butonu event listener'ı
  // Debug ve test butonları kaldırıldı

  if (closeProdModal) {
    console.log('✅ closeProdModal event listener ekleniyor...');
    closeProdModal.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('🖱️ Modal kapatma butonu tıklandı!');
      closeProductModal();
    });
  } else {
    console.error('❌ closeProdModal bulunamadı!');
  }

  // Vazgeç butonuna da event listener ekle
  const closeModalBtns = document.querySelectorAll('.close-modal-btn');
  closeModalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeProductModal();
    });
  });

  // Modal dışına tıklandığında kapat
  if (prodModal) {
    prodModal.addEventListener('click', (e) => {
      if (e.target === prodModal) {
        closeProductModal();
      }
    });
  }
  
  // Modal açma fonksiyonunu tanımla
  openProductModal = (productIdToEdit = null) => {
    console.log('🎯 openProductModal çağrıldı, productIdToEdit:', productIdToEdit);
    console.log('🔍 Modal açılma öncesi element kontrolü...');
    
    // Gerekli elementlerin varlığını tekrar kontrol et
    if (!prodModal || !prodForm || !sizeStocksContainer || !variantsContainer) {
      console.error('❌ Modal açılırken gerekli elementler bulunamadı!');
      console.error('  - prodModal:', !!prodModal);
      console.error('  - prodForm:', !!prodForm);
      console.error('  - sizeStocksContainer:', !!sizeStocksContainer);
      console.error('  - variantsContainer:', !!variantsContainer);
      alert('Modal açılamadı. Lütfen sayfayı yenileyin.');
      return;
    }
    
    console.log('✅ Tüm gerekli elementler mevcut, modal açılıyor...');
    
    try {
      // Varyant dosya haritasını sıfırla (karışmayı önlemek için)
      variantImageMap = new Map();
      console.log('🗂️ Variant image map sıfırlandı');
      
      // Form ve tüm alanları temizle
      if (prodForm) {
        prodForm.reset();
        console.log('📝 Form temizlendi');
      }
      
      // Editing modunu set et
      if (productIdToEdit) {
        editingProductId = productIdToEdit;
        console.log('✏️ Düzenleme modu aktif, productId:', editingProductId);
      } else {
        editingProductId = null;
        console.log('➕ Yeni ürün ekleme modu aktif');
      }
      
      // Dinamik container'ları temizle
      if (sizeStocksContainer) {
        sizeStocksContainer.innerHTML = '';
        console.log('SizeStocks container temizlendi');
        // Varsayılan bir satır ekle
        if (typeof addSizeRow === 'function') {
          addSizeRow();
          console.log('Varsayılan size row eklendi');
        } else {
          console.warn('addSizeRow fonksiyonu henüz tanımlanmamış');
        }
      }
      
      if (variantsContainer) {
        variantsContainer.innerHTML = '';
        console.log('Variants container temizlendi');
        // Varsayılan bir varyant ekle
        if (typeof addVariant === 'function') {
          addVariant();
          console.log('Varsayılan varyant eklendi');
        } else {
          console.warn('addVariant fonksiyonu henüz tanımlanmamış');
        }
      }
      
      // Çoklu görselleri temizle
      productImages = [];
      if (typeof renderProductImages === 'function') {
        renderProductImages();
        console.log('Product images temizlendi');
      }
      if (typeof updateImageControls === 'function') {
        updateImageControls();
        console.log('Image controls güncellendi');
      }
      
      // Modal'ı göster
      if (prodModal) {
        console.log('🎭 Modal görünürlük durumu değiştiriliyor...');
        console.log('  - Önceki classList:', prodModal.className);
        
        // Önce tüm modal class'larını temizle
        prodModal.className = 'fixed inset-0 bg-black/40 p-2 md:p-4 z-[9999] overflow-y-auto';
        
        // Sonra gerekli class'ları ekle
        prodModal.classList.add('flex', 'items-center', 'justify-center');
        
        // Body'ye modal-open class'ı ekle - KALDIRILDI
        // document.body.classList.add('modal-open');
        
        console.log('  - Sonraki classList:', prodModal.className);
        console.log('✅ Modal başarıyla açıldı');
        
        // Modal'ın gerçekten görünür olduğunu kontrol et
        setTimeout(() => {
          const rect = prodModal.getBoundingClientRect();
          console.log('🔍 Modal görünürlük kontrolü:');
          console.log('  - offsetWidth:', prodModal.offsetWidth);
          console.log('  - offsetHeight:', prodModal.offsetHeight);
          console.log('  - getBoundingClientRect:', rect);
          console.log('  - display style:', window.getComputedStyle(prodModal).display);
          
          // Modal durum bilgisini güncelle
          updateModalStatus();
        }, 100);
      }
      
      // Sayfayı yukarı scroll yap
      window.scrollTo({ top: 0, behavior: 'smooth' });
      console.log('📜 Sayfa yukarı scroll edildi');
      
      // Textarea otomatik yükseklik ayarlamasını kur
      setTimeout(() => {
        setupTextareaAutoResize();
      }, 100);
      
    } catch (error) {
      console.error('❌ Modal açılırken hata oluştu:', error);
      alert('Modal açılırken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  // Modal kapatma fonksiyonunu tanımla
  closeProductModal = () => {
    console.log('🔒 closeProductModal çağrıldı');
    
    if (prodModal) {
      console.log('🎭 Modal kapatılıyor...');
      console.log('  - Önceki classList:', prodModal.className);
      
      // Modal'ı gizle
      prodModal.className = 'fixed inset-0 bg-black/40 hidden p-2 md:p-4 z-[9999] overflow-y-auto';
      
      // Body'den modal-open class'ını kaldır - KALDIRILDI
      // document.body.classList.remove('modal-open');
      
      // Scroll pozisyonunu sıfırla ve sayfa scroll'unu etkinleştir
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      
      console.log('  - Sonraki classList:', prodModal.className);
      console.log('✅ Modal başarıyla kapatıldı');
      console.log('✅ Sayfa scroll pozisyonu sıfırlandı');
      
      // Modal durum bilgisini güncelle
      updateModalStatus();
    }
    
    // Form ve alanları temizle
    if (prodForm) {
      prodForm.reset();
      console.log('📝 Form temizlendi');
    }
    
    // Dinamik container'ları temizle
    if (sizeStocksContainer) {
      sizeStocksContainer.innerHTML = '';
      console.log('📦 SizeStocks container temizlendi');
    }
    
    if (variantsContainer) {
      variantsContainer.innerHTML = '';
      console.log('🎨 Variants container temizlendi');
    }
    
    // Varyant dosya haritasını da sıfırla
    variantImageMap = new Map();
    console.log('🗂️ Variant image map temizlendi');
    
    // Çoklu görselleri temizle
    productImages = [];
    if (typeof renderProductImages === 'function') {
      renderProductImages();
      console.log('🖼️ Product images temizlendi');
    }
    if (typeof updateImageControls === 'function') {
      updateImageControls();
      console.log('🎛️ Image controls güncellendi');
    }
    
    editingProductId = null;
    console.log('🔄 Editing mode sıfırlandı');
  };
  
  // addSizeRow fonksiyonunu tanımla - global olarak tanımla
  addSizeRow = (val = { size: '', stock: '' }) => {
    console.log('addSizeRow çağrıldı:', val);
    
    // sizeStocksContainer kontrolü
    if (!sizeStocksContainer) {
      console.error('sizeStocksContainer bulunamadı! addSizeRow çalışamıyor.');
      return;
    }
    
    try {
      // Eğer sadece string (beden adı) gelirse, obje formatına çevir
      if (typeof val === 'string') {
        val = { size: val, stock: '' };
      }
      
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50';
      row.innerHTML = `
        <input placeholder="Beden (örn: S)" class="flex-1 rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" value="${val.size ?? ''}">
        <input type="number" min="0" placeholder="Stok" class="w-32 rounded-xl border-slate-200 focus:ring-[#CBA135] px-3 py-2" value="${val.stock ?? ''}">
        <button type="button" class="size-remove px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50">Sil</button>
      `;
      
      const delBtn = row.querySelector('.size-remove');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          // Scroll pozisyonunu koru
          const currentScrollTop = sizeStocksContainer.scrollTop;
          row.remove();
          setTimeout(() => {
            sizeStocksContainer.scrollTop = currentScrollTop;
          }, 10);
        });
      }
      
      // Scroll pozisyonunu koru
      const currentScrollTop = sizeStocksContainer.scrollTop;
      sizeStocksContainer.appendChild(row);
      setTimeout(() => {
        sizeStocksContainer.scrollTop = currentScrollTop;
      }, 10);
      
      console.log('Size row başarıyla eklendi');
      
    } catch (error) {
      console.error('addSizeRow çalışırken hata oluştu:', error);
    }
  };

  // addColorVariant fonksiyonunu tanımla
  addColorVariant = (val = { name: '', hexCode: '', imageUrl: '', colorImageFile: null, isMainColor: false }) => {
    console.log('addColorVariant çağrıldı:', val);
    
    // colorVariantsContainer kontrolü
    if (!colorVariantsContainer) {
      console.error('colorVariantsContainer bulunamadı!');
      return;
    }
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50';
    row.innerHTML = `
      <div class="flex-1">
        <input placeholder="Renk Adı (örn: Kırmızı)" class="w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2 text-sm" value="${val.name ?? ''}" name="colorName[]">
      </div>
      <div class="w-24">
        <input type="color" class="w-full h-10 rounded-lg border-slate-200 focus:ring-2 focus:ring-[#CBA135]" value="${val.hexCode ?? '#000000'}" name="colorHex[]">
      </div>
      <div class="w-40">
        <div class="flex items-center gap-2">
          <input type="file" accept="image/*" class="color-image-input hidden" />
          <button type="button" class="color-pick-btn px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50">
            ${val.colorImageFile || val.imageUrl ? 'Görsel Değiştir' : 'Görsel Ekle'}
          </button>
        </div>
        <div class="color-image-preview mt-1 ${val.colorImageFile || val.imageUrl ? '' : 'hidden'}">
          <img src="${val.colorImageFile ? URL.createObjectURL(val.colorImageFile) : val.imageUrl}" class="w-8 h-8 object-cover rounded border" />
        </div>
      </div>
      <button type="button" class="variant-remove px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">Sil</button>
    `;
    
    const delBtn = row.querySelector('.variant-remove');
    const colorImageInput = row.querySelector('.color-image-input');
    const colorPickBtn = row.querySelector('.color-pick-btn');
    const colorImagePreview = row.querySelector('.color-image-preview');
    
    // Görsel seçme butonu
    colorPickBtn.addEventListener('click', () => colorImageInput.click());
    
    // Görsel seçildiğinde
    colorImageInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      console.log('Varyant görseli seçildi:', file.name, file.size, file.type);
      
      // Dosya boyutu kontrolü (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        alert('Görsel boyutu 5MB\'dan küçük olmalıdır!');
        colorImageInput.value = '';
        return;
      }
      
      // Dosya tipi kontrolü
      if (!file.type.startsWith('image/')) {
        alert('Lütfen geçerli bir görsel dosyası seçin!');
        colorImageInput.value = '';
        return;
      }
      
      // Cropper.js kontrolü
      if (typeof Cropper === 'undefined') {
        console.warn('Cropper.js henüz yüklenmedi, basit fallback kullanılıyor');
        // Basit fallback: dosyayı olduğu gibi kullan
        row.colorImageFile = file;
        const img = colorImagePreview.querySelector('img');
        img.src = URL.createObjectURL(file);
        colorImagePreview.classList.remove('hidden');
        colorPickBtn.textContent = 'Görsel Değiştir';
        colorImageInput.value = '';
        console.log('Varyant görseli fallback ile eklendi');
        return;
      }
      
      // Kırpma modalı aç
      openCropperModal(file, {
        aspectRatio: getProductCardAspectRatio(),
        onDone: (blob) => {
          console.log('Görsel kırpıldı, blob oluşturuldu:', blob.size, blob.type);
          
          const croppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
          
          // Row'a dosya referansını ekle
          row.colorImageFile = croppedFile;
          console.log('Row\'a dosya referansı eklendi:', row.colorImageFile);
          
          // Preview'i güncelle
          const img = colorImagePreview.querySelector('img');
          img.src = URL.createObjectURL(croppedFile);
          colorImagePreview.classList.remove('hidden');
          
          // Buton metnini güncelle
          colorPickBtn.textContent = 'Görsel Değiştir';
          
          // Input'u temizle
          colorImageInput.value = '';
          
          // Başarı mesajı
          console.log('Varyant görseli başarıyla eklendi!');
        },
        onError: (error) => {
          console.error('Görsel kırpma hatası:', error);
          alert('Görsel kırpılırken bir hata oluştu. Lütfen tekrar deneyin.');
          colorImageInput.value = '';
        }
      });
    });
    
    delBtn.addEventListener('click', () => row.remove());
    
    // Row'u container'a ekle
    colorVariantsContainer.appendChild(row);
    console.log('Varyant row başarıyla eklendi, toplam varyant sayısı:', colorVariantsContainer.children.length);
  };

  // Yeni gelişmiş varyant sistemi fonksiyonu
  addVariant = (val = { color: '', colorHex: '#000000', images: [], sizeStocks: [] }) => {
    console.log('addVariant çağrıldı:', val);
    
    // variantsContainer kontrolü
    if (!variantsContainer) {
      console.error('variantsContainer bulunamadı! addVariant çalışamıyor.');
      return;
    }
    
    try {
      const variantId = Date.now() + Math.random();
      const variantCard = document.createElement('div');
      variantCard.className = 'border border-slate-200 rounded-xl p-4 sm:p-6 bg-slate-50';
      variantCard.dataset.variantId = variantId;
      
      // Güvenli görsel URL'leri ve sizeStocks
      const safeImages = val.images && val.images.length > 0 ? val.images : [];
      const safeSizeStocks = val.sizeStocks && val.sizeStocks.length > 0 ? val.sizeStocks : [];
      
      console.log('Variant card oluşturuluyor, ID:', variantId);
      
      variantCard.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-semibold text-slate-800">Renk Varyantı</h4>
          <button type="button" class="variant-delete-btn p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
        
        <div class="grid lg:grid-cols-2 gap-4 sm:gap-6">
          <!-- Sol Kolon: Renk Adı ve Görseller -->
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-2">Renk Bilgisi</label>
              <div class="space-y-3">
                <div class="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div class="flex-1 w-full">
                    <label class="block text-xs text-slate-600 mb-1">Renk Adı</label>
                    <input type="text" placeholder="Örn: Kırmızı, Mavi, Siyah" 
                           class="variant-color-name w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2 text-sm" 
                           value="${val.color || ''}" />
                  </div>
                  <div class="w-full sm:w-20">
                    <label class="block text-xs text-slate-600 mb-1">Renk Kodu</label>
                    <input type="color" 
                           class="variant-color-hex w-full h-10 rounded-lg border-slate-200 focus:ring-2 focus:ring-[#CBA135]" 
                           value="${val.colorHex || '#000000'}" />
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-2">Renk Görselleri</label>
              <div class="variant-images-dropzone border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-[#CBA135] transition-colors cursor-pointer">
                <input type="file" class="variant-images-input hidden" multiple accept="image/*" />
                <div class="variant-images-preview grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mt-4">
                  ${safeImages.map(img => {
                    const imgUrl = typeof img === 'string' ? img : (img.url || img);
                    return `
                      <div class="relative" data-image-url="${imgUrl}">
                        <img src="${imgUrl}" class="w-16 h-16 sm:w-18 sm:h-18 lg:w-20 lg:h-20 object-cover rounded-lg" />
                        <button type="button" class="variant-image-remove absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-5 h-5 text-xs hover:bg-rose-600">×</button>
                    </div>
                    `;
                  }).join('')}
                </div>
                <p class="text-sm text-slate-500 mt-2">
                  <span class="text-[#CBA135] underline">Görsel seçin</span> veya sürükleyip bırakın
                </p>
                <p class="text-xs text-slate-400">Birden fazla görsel seçebilirsiniz</p>
              </div>
            </div>
          </div>
          
          <!-- Sağ Kolon: Beden Bazlı Stok -->
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-2">Beden Bazlı Stok</label>
              <div class="variant-size-stocks-container space-y-2">
                ${val.sizeStocks && val.sizeStocks.length > 0 ? val.sizeStocks.map((sizeStock, index) => `
                  <div class="flex items-center gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50">
                    <input type="text" placeholder="Beden (örn: S)" 
                           class="variant-size-name flex-1 rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" 
                           value="${sizeStock.size || ''}" />
                    <input type="number" min="0" placeholder="Stok" 
                           class="variant-size-stock w-32 rounded-xl border-slate-200 focus:ring-[#CBA135] px-3 py-2" 
                           value="${sizeStock.stock || ''}" />
                    <button type="button" class="variant-size-remove px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50">Sil</button>
            </div>
                `).join('') : ''}
              </div>
                          <div class="mt-3 space-y-3">
                <button type="button" class="variant-add-size-btn w-full sm:w-auto px-3 py-1.5 text-sm text-[#CBA135] border border-[#CBA135] rounded-lg hover:bg-[#CBA135] hover:text-white transition-colors">
                  + Beden Ekle
                </button>
                
                <!-- Hızlı beden ekleme -->
                <div class="space-y-2">
                  <span class="text-xs text-slate-600 block">Hızlı ekle:</span>
                  <div class="grid grid-cols-3 sm:grid-cols-6 gap-1">
                    <button type="button" class="variant-quick-size-btn px-2 py-1 text-xs bg-slate-100 hover:bg-[#CBA135] hover:text-white rounded border transition-colors" data-size="XS">XS</button>
                    <button type="button" class="variant-quick-size-btn px-2 py-1 text-xs bg-slate-100 hover:bg-[#CBA135] hover:text-white rounded border transition-colors" data-size="S">S</button>
                    <button type="button" class="variant-quick-size-btn px-2 py-1 text-xs bg-slate-100 hover:bg-[#CBA135] hover:text-white rounded border transition-colors" data-size="M">M</button>
                    <button type="button" class="variant-quick-size-btn px-2 py-1 text-xs bg-slate-100 hover:bg-[#CBA135] hover:text-white rounded border transition-colors" data-size="L">L</button>
                    <button type="button" class="variant-quick-size-btn px-2 py-1 text-xs bg-slate-100 hover:bg-[#CBA135] hover:text-white rounded border transition-colors" data-size="XL">XL</button>
                    <button type="button" class="variant-quick-size-btn px-2 py-1 text-xs bg-slate-100 hover:bg-[#CBA135] hover:text-white rounded border transition-colors" data-size="XXL">XXL</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Event listener'ları ekle
      const deleteBtn = variantCard.querySelector('.variant-delete-btn');
      const imagesInput = variantCard.querySelector('.variant-images-input');
      const imagesDropzone = variantCard.querySelector('.variant-images-dropzone');
      const addSizeBtn = variantCard.querySelector('.variant-add-size-btn');
      
      // Varyant silme
      deleteBtn.addEventListener('click', () => {
        // Smooth scroll davranışı için
        const container = variantsContainer;
        const scrollTop = container.scrollTop;
        
        variantCard.remove();
        
        // Scroll pozisyonunu koru
        setTimeout(() => {
          container.scrollTop = scrollTop;
        }, 10);
      });
      
      // Görsel ekleme
      imagesDropzone.addEventListener('click', () => imagesInput.click());
      imagesInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        // Her dosya için kırpma modalı aç
        files.forEach((file, index) => {
          openCropperModal(file, {
            aspectRatio: getProductCardAspectRatio(),
            onDone: (blob) => {
              const croppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
              addVariantImage(variantCard, croppedFile);
              
              // Son dosya işlendikten sonra input'u temizle
              if (index === files.length - 1) {
                imagesInput.value = '';
              }
            }
          });
        });
      });
      
      // Drag & Drop
      setupDragAndDrop(imagesDropzone, imagesInput, (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        
        files.forEach((file, index) => {
          openCropperModal(file, {
            aspectRatio: getProductCardAspectRatio(),
            onDone: (blob) => {
              const croppedFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
              addVariantImage(variantCard, croppedFile);
              
              if (index === files.length - 1) {
                imagesInput.value = '';
              }
            }
          });
        });
      });
      
      // Beden ekleme (beden bazlı stok sistemi)
      addSizeBtn.addEventListener('click', () => {
        addVariantSizeStock(variantCard);
      });
      
      // Hızlı beden ekleme butonları
      const quickSizeBtns = variantCard.querySelectorAll('.variant-quick-size-btn');
      quickSizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const size = btn.getAttribute('data-size');
          if (size) {
            addVariantSizeStock(variantCard, size);
          }
        });
      });
      
      // Mevcut görsellerin silinmesi için event listener
      variantCard.querySelectorAll('.variant-image-remove').forEach(removeBtn => {
        removeBtn.addEventListener('click', () => {
          removeBtn.closest('.relative').remove();
        });
      });
      
      // Varsayılan bedenler ekle (eğer henüz beden yoksa)
      if (!val.sizeStocks || val.sizeStocks.length === 0) {
        ['S', 'M', 'L'].forEach(size => addVariantSizeStock(variantCard, size));
      }
      
      // Varyant eklenirken scroll pozisyonunu koru
      const currentScrollTop = variantsContainer.scrollTop;
      variantsContainer.appendChild(variantCard);
      
      setTimeout(() => {
        variantsContainer.scrollTop = currentScrollTop;
      }, 10);
      
      console.log('Variant card başarıyla eklendi, ID:', variantId);
      
    } catch (error) {
      console.error('Variant card oluşturulurken hata:', error);
    }
  };
  
  // Varyant görsel ekleme yardımcı fonksiyonu
  const addVariantImage = (variantCard, file) => {
    const previewContainer = variantCard.querySelector('.variant-images-preview');
    if (!previewContainer) return;
    
    const imageDiv = document.createElement('div');
    imageDiv.className = 'relative';
    imageDiv.innerHTML = `
      <img src="${URL.createObjectURL(file)}" class="w-20 h-20 object-cover rounded-lg" />
      <button type="button" class="variant-image-remove absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-5 h-5 text-xs hover:bg-rose-600">×</button>
    `;
    
    // Görsel silme
    const removeBtn = imageDiv.querySelector('.variant-image-remove');
    removeBtn.addEventListener('click', () => {
      // Haritadan da kaldır
      const imageId = imageDiv.dataset.imageId;
      if (imageId && variantImageMap.has(imageId)) {
        variantImageMap.delete(imageId);
      }
      imageDiv.remove();
    });
    
    // Dosya referansını sakla
    const imageId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    imageDiv.dataset.fileName = file.name;
    imageDiv.dataset.fileSize = file.size;
    imageDiv.dataset.fileType = file.type;
    imageDiv.dataset.imageId = imageId;
    
    // Dosya nesnesini global haritada sakla
    variantImageMap.set(imageId, file);
    
    previewContainer.appendChild(imageDiv);
  };
  
  // Varyant beden ekleme yardımcı fonksiyonu
  const addVariantSize = (variantCard, size = '') => {
    const sizesContainer = variantCard.querySelector('.variant-sizes-container');
    if (!sizesContainer) return;
    
    const sizeDiv = document.createElement('div');
    sizeDiv.className = 'flex items-center gap-2';
    sizeDiv.innerHTML = `
      <input type="text" placeholder="Beden" 
             class="variant-size flex-1 rounded-lg border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" 
             value="${size}" />
      <button type="button" class="variant-size-remove p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
      </button>
    `;
    
    // Beden silme
    const removeBtn = sizeDiv.querySelector('.variant-size-remove');
    removeBtn.addEventListener('click', () => {
      // Scroll pozisyonunu koru
      const currentScrollTop = sizesContainer.scrollTop;
      sizeDiv.remove();
      setTimeout(() => {
        sizesContainer.scrollTop = currentScrollTop;
      }, 10);
    });
    
    // Scroll pozisyonunu koru
    const currentScrollTop = sizesContainer.scrollTop;
    sizesContainer.appendChild(sizeDiv);
    setTimeout(() => {
      sizesContainer.scrollTop = currentScrollTop;
    }, 10);
  };
  
  // Varyant beden bazlı stok ekleme yardımcı fonksiyonu
  const addVariantSizeStock = (variantCard, sizeValue = '', stockValue = '') => {
    const sizeStocksContainer = variantCard.querySelector('.variant-size-stocks-container');
    if (!sizeStocksContainer) return;
    
    const sizeStockRow = document.createElement('div');
    sizeStockRow.className = 'flex items-center gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50';
    sizeStockRow.innerHTML = `
      <input type="text" placeholder="Beden (örn: S)" 
             class="variant-size-name flex-1 rounded-xl border-slate-200 focus:ring-2 focus:ring-[#CBA135] px-3 py-2" 
             value="${sizeValue}" />
      <input type="number" min="0" placeholder="Stok" 
             class="variant-size-stock w-32 rounded-xl border-slate-200 focus:ring-[#CBA135] px-3 py-2" 
             value="${stockValue}" />
      <button type="button" class="variant-size-remove px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50">Sil</button>
    `;
    
    const removeBtn = sizeStockRow.querySelector('.variant-size-remove');
    removeBtn.addEventListener('click', () => sizeStockRow.remove());
    
    sizeStocksContainer.appendChild(sizeStockRow);
  };
  
  // Eksik event listener'ları ekle
  if (addSizeRowBtn) {
    addSizeRowBtn.addEventListener('click', () => {
      addSizeRow();
      // Beden eklendikten sonra sayfayı yukarı scroll yap
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } else {
    console.error('addSizeRowBtn bulunamadı!');
  }
  
  if (addColorVariantBtn) {
    addColorVariantBtn.addEventListener('click', () => {
      console.log('Varyant ekleme butonu tıklandı');
      console.log('colorVariantsContainer mevcut mu:', !!colorVariantsContainer);
      console.log('colorVariantsContainer ID:', colorVariantsContainer?.id);
      console.log('colorVariantsContainer class:', colorVariantsContainer?.className);
      addColorVariant();
    });
  } else {
    console.error('addColorVariantBtn bulunamadı!');
  }
  
  if (addVariantBtn) {
    addVariantBtn.addEventListener('click', () => {
      // Varyant container'ı göster
      if (variantsContainer) {
        variantsContainer.classList.remove('hidden');
      }
      addVariant();
      // Varyant eklendikten sonra sayfayı yukarı scroll yap
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } else {
    console.error('addVariantBtn bulunamadı!');
  }
  
  // Hızlı beden ekleme butonları için event listener
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('quick-size-btn')) {
      const size = e.target.getAttribute('data-size');
      if (size) {
        addSizeRow(size);
        // Scroll yukarı
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  });

  

  
  // Token geçerliliğini kontrol et
  const isValid = await checkTokenValidity();
  if (!isValid) return;
  
  // Setup image management
  setupImageManagement();
  
  await loadCategories();
  await loadProducts();
  
  // Çoklu silme sistemi
  setupBulkDeleteSystem();
  

  
  // Ürün form submit event listener'ı
  prodForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    console.log('Ürün form submit edildi');
    
    try {
      // Form validasyonu
      const formData = new FormData(prodForm);
      const name = formData.get('name')?.trim();
      const categoryId = formData.get('categoryId');
      const price = Number(formData.get('price'));
      
      console.log('Form validasyonu:', { name, categoryId, price });
      
      if (!name || name.length < 2) {
        alert('Ürün adı en az 2 karakter olmalıdır');
        console.error('Form validasyon hatası: Ürün adı eksik veya çok kısa');
        return;
      }
      
      if (!categoryId) {
        alert('Kategori seçimi zorunludur');
        console.error('Form validasyon hatası: Kategori seçilmedi');
        return;
      }
      
      if (!price || price <= 0) {
        alert('Geçerli bir fiyat giriniz');
        console.error('Form validasyon hatası: Geçersiz fiyat');
        return;
      }
      
      // collect sizeStocks from dynamic rows
      const rows = sizeStocksContainer?.querySelectorAll('div');
      const sizeStocks = [];
      console.log('SizeStocks container:', sizeStocksContainer);
      console.log('SizeStocks rows sayısı:', rows?.length);
      
      if (rows && rows.length > 0) {
        rows.forEach((row, index) => {
          const inputs = row.querySelectorAll('input');
          const size = inputs?.[0]?.value?.trim();
          const stock = Number(inputs?.[1]?.value ?? '');
          console.log(`Row ${index}: size="${size}", stock=${stock}`);
          if (size && !Number.isNaN(stock)) sizeStocks.push({ size, stock });
        });
      } else {
        console.log('SizeStocks rows bulunamadı veya boş');
      }
      
      console.log('Toplanan sizeStocks:', sizeStocks);
      if (sizeStocks.length > 0) {
        formData.append('sizeStocks', JSON.stringify(sizeStocks));
      }


      
      // collect variants from new variant system
      const variantCards = variantsContainer?.querySelectorAll('[data-variant-id]');
      const variants = [];
      const variantImageCounts = [];
      console.log('Variants container:', variantsContainer);
      console.log('Variant cards sayısı:', variantCards?.length);
      
      variantCards?.forEach((card, index) => {
        const colorName = card.querySelector('.variant-color-name')?.value?.trim();
        const colorHex = card.querySelector('.variant-color-hex')?.value || '#000000';
        console.log(`Variant ${index}: color="${colorName}", hex="${colorHex}"`);
        
        // Beden bazlı stok verilerini topla
        const sizeStockRows = card.querySelectorAll('.variant-size-stocks-container > div');
        const sizeStocks = [];
        console.log(`Variant ${index} sizeStockRows sayısı:`, sizeStockRows.length);
        
        sizeStockRows.forEach((row, rowIndex) => {
          const sizeInput = row.querySelector('.variant-size-name');
          const stockInput = row.querySelector('.variant-size-stock');
          if (sizeInput && stockInput) {
            const size = sizeInput.value.trim();
            const stock = Number(stockInput.value) || 0;
            console.log(`Variant ${index} Row ${rowIndex}: size="${size}", stock=${stock}`);
            if (size) {
              sizeStocks.push({ size, stock });
            }
          }
        });
        
        if (colorName) {
          const variant = {
            color: colorName,
            colorHex: colorHex,
            sizeStocks: sizeStocks,
            // Toplam stok (boşsa 0)
            stock: sizeStocks.length > 0 ? sizeStocks.reduce((total, item) => total + item.stock, 0) : 0
          };
          
          // Görselleri topla
          const imageElements = card.querySelectorAll('.variant-images-preview img');
          const images = [];
          let newFileCountForThisVariant = 0;
          imageElements.forEach((img, imgIndex) => {
            const imageDiv = img.closest('.relative');
            if (imageDiv && imageDiv.dataset.imageId) {
              // Global haritadan dosya nesnesini al
              const imageId = imageDiv.dataset.imageId;
              const file = variantImageMap.get(imageId);
              if (file) {
                formData.append('variantImages', file);
                images.push(file.name);
                newFileCountForThisVariant += 1;
              } else {
                // Dosya bulunamadıysa, fileName'i kullan
                images.push(imageDiv.dataset.fileName);
              }
            } else {
              // Mevcut görsel URL'i (düzenleme durumunda)
              const imgSrc = img.src;
              if (imgSrc && !imgSrc.startsWith('blob:')) {
                images.push(imgSrc);
              }
            }
          });
          
          variant.images = images;
          variants.push(variant);
          variantImageCounts.push(newFileCountForThisVariant);
          console.log(`Variant ${index} eklendi:`, variant);
        }
      });
      
      console.log('Toplanan variants:', variants);
      console.log('Variant image counts:', variantImageCounts);
      
      if (variants.length) formData.append('variants', JSON.stringify(variants));
      if (variantImageCounts.length) formData.append('variantImageCounts', JSON.stringify(variantImageCounts));
      

      
      // Çoklu görselleri FormData'ya ekle
      console.log('Product images:', productImages);
      if (productImages.length > 0) {
        // Tüm görselleri images array olarak ekle
        productImages.forEach((img, index) => {
          if (img.file) {
            console.log(`Image ${index} ekleniyor:`, img.file.name, img.file.size, img.file.type);
            formData.append('images', img.file);
          } else {
            console.log(`Image ${index} dosya yok:`, img);
          }
        });
      }

      try {
        console.log('Ürün kaydediliyor...');
        console.log('FormData içeriği:');
        for (let [key, value] of formData.entries()) {
          console.log(`${key}:`, value);
        }
        
        const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
        const method = editingProductId ? 'PUT' : 'POST';
        console.log('API çağrısı:', method, url);
        
        const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: formData });
        console.log('API response status:', res.status);
        
        if (res.status === 401) {
          alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
          localStorage.removeItem('token');
          window.location.href = '/admin/login.html';
          return;
        }
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('API hata detayı:', errorData);
          alert(`Ürün kaydedilemedi: ${errorData.message || 'Bilinmeyen hata'}`);
          return;
        }
        
        const successData = await res.json().catch(() => ({}));
        console.log('Başarılı response:', successData);
        
        alert(editingProductId ? 'Ürün başarıyla güncellendi!' : 'Ürün başarıyla eklendi!');
        editingProductId = null;
        await loadProducts();
        
        // Modal'ı düzgün şekilde kapat ve scroll'u sıfırla
        prodModal.classList.add('hidden');
        prodModal.classList.remove('flex', 'items-center', 'justify-center');
        
        // Scroll pozisyonunu sıfırla ve sayfa scroll'unu etkinleştir
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        
        console.log('✅ Ürün eklendikten sonra modal kapatıldı ve scroll pozisyonu sıfırlandı');
      } catch (error) {
        console.error('Ürün kaydedilirken hata:', error);
        console.error('Hata stack:', error.stack);
        alert('Ürün kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
      }
    } catch (error) {
      console.error('Ürün form submit edilirken hata:', error);
      alert('Ürün form submit edilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  });

  // Kategori form submit event listener'ı
  catForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Form validasyonu
    const formData = new FormData(catForm);
    const name = formData.get('name')?.trim();
    
    if (!name) {
      alert('Kategori adı zorunludur');
      return;
    }
    
    if (name.length < 2) {
      alert('Kategori adı en az 2 karakter olmalıdır');
      return;
    }
    
    // Kırpılmış görsel dosyasını FormData'ya ekle
    if (catCroppedFile) {
      formData.set('image', catCroppedFile);
    }

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      
      if (res.status === 401) {
        alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
        localStorage.removeItem('token');
        window.location.href = '/admin/login.html';
        return;
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(`Kategori eklenemedi: ${errorData.message || 'Bilinmeyen hata'}`);
        return;
      }
      
      alert('Kategori başarıyla eklendi!');
      catForm.reset();
      removeCatImage(); // Reset image preview
      // Kırpılmış görsel dosyasını temizle
      catCroppedFile = null;
      await loadCategories();
    } catch (error) {
      console.error('Kategori eklenirken hata:', error);
      alert('Kategori eklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
    });
  });

  // Dinamik oran tespiti (kategori kartındaki class'lardan okur, yoksa varsayılan)
  function parseAspectFromClassList(el, fallback = 1.6) {
    if (!el) return fallback;
    const cls = (el.className || '').toString();
    const m = cls.match(/aspect-\[(\d+)\s*\/\s*(\d+)\]/); // ör: aspect-[16/10]
    if (m) {
      const w = Number(m[1]), h = Number(m[2]);
      if (w > 0 && h > 0) return w / h;
    }
    return fallback;
  }
  function getCategoryCardAspectRatio() {
    // Admin kategori gridinde kart gövdesi: <div class="aspect-[5/6] ...">
    const probe = document.querySelector('#catList .aspect-\\[5\\/6\\], #catList [class*="aspect-["]');
    // Yoksa 5:6'e düş (daha kompakt, dikey görseller için)
    return parseAspectFromClassList(probe, 5 / 6);
  }
  function getProductCardAspectRatio() {
    // Ürün kartları için daha esnek oran
    // 4:5 oranı (0.8) - dikey ürün görselleri için ideal, kadının kafası/üst kısmı öncelikli
    // 3:4 oranı (0.75) - dikey ürün görselleri için alternatif
    // 1:1 oranı (1.0) - kare ürün görselleri için
    return 4 / 5; // 0.8 - dikey ürün görselleri için daha uygun, üst kısım öncelikli
  }

  // Canvas'tan Blob üretimi (Safari fallback dahil)
  function canvasToBlobCompat(canvas, cb, type = 'image/jpeg', quality = 0.9) {
    if (canvas.toBlob) return canvas.toBlob(cb, type, quality);
    const dataUrl = canvas.toDataURL(type, quality);
    const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    cb(new Blob([u8], { type: mime }));
  }

  // Kırpma modali (interaktif sürükle/zoom, sabit aspectRatio)
  async function openCropperModal(file, { aspectRatio = 4/3, onDone, onError } = {}) {
    // Loading göstergesi ekle
    const loadingModal = document.createElement('div');
    loadingModal.className = 'fixed inset-0 z-[100000] bg-black/50 flex items-center justify-center';
    loadingModal.innerHTML = `
      <div class="bg-white rounded-xl p-6 flex items-center gap-3">
        <div class="animate-spin w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
        <span>Kırpma aracı yükleniyor...</span>
      </div>
    `;
    document.body.appendChild(loadingModal);
    
    // Cropper.js kontrolü
    try {
      const isAvailable = await checkCropperAvailability();
      loadingModal.remove(); // Loading'i kaldır
      
      if (!isAvailable) {
        simpleCropFallback(file, { aspectRatio, onDone, onError });
        return;
      }
    } catch (error) {
      loadingModal.remove();
      console.error('Cropper.js kontrol hatası:', error);
      onError?.(error);
      return;
    }
    const url = URL.createObjectURL(file);
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100000] bg-black/50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
        <div class="p-4 flex items-center justify-between border-b">
          <div>
            <h3 class="text-lg font-semibold">Görseli Kırp</h3>
            <p class="text-sm text-slate-500">${file.name}</p>
          </div>
          <button id="cropClose" class="p-2 rounded-lg hover:bg-slate-100">✕</button>
        </div>
        <div class="p-4">
          <div class="relative max-h-[70vh] overflow-auto">
            <img id="cropImage" src="${url}" class="max-w-full select-none" />
          </div>
          <div class="flex items-center gap-3 mt-4 justify-end">
            <span class="text-sm text-slate-500 mr-auto">Oran: ${aspectRatio.toFixed(3).replace(/\.0+$/,'')}</span>
            <button id="cropCancel" class="px-4 py-2 border rounded">Vazgeç</button>
            <button id="cropSave" class="px-4 py-2 rounded text-white" style="background:linear-gradient(135deg,#CBA135,#E3C77E)">Kırp ve Kaydet</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const img = modal.querySelector('#cropImage');
    let cropper;
    img.addEventListener('load', () => {
      try {
        cropper = new Cropper(img, {
          aspectRatio,
          viewMode: 2,         // görüntü alanı dışına taşmasın ve üst kısım öncelikli
          dragMode: 'move',    // fare ile sürükle
          autoCrop: true,
          autoCropArea: 0.8,   // ilk açılışta alanın %80'ini doldur, üst kısım öncelikli
          movable: true,
          zoomable: true,      // teker ile zoom
          wheelZoomRatio: 0.1,
          background: false,
          responsive: true,
          guides: true,
          center: true,
          highlight: true,
          cropBoxResizable: true,  // kırpma kutusu boyutlandırılabilir
          cropBoxMovable: true,    // kırpma kutusu hareket ettirilebilir
          minCropBoxWidth: 100,    // minimum kırpma kutusu genişliği
          minCropBoxHeight: 100    // minimum kırpma kutusu yüksekliği
        });
        console.log('Cropper.js başarıyla başlatıldı');
      } catch (error) {
        console.error('Cropper.js başlatma hatası:', error);
        onError?.(error);
        close();
      }
    });
    
    // Görsel yüklenme hatası
    img.addEventListener('error', (error) => {
      console.error('Görsel yükleme hatası:', error);
      onError?.(error);
      close();
    });

    const close = () => { cropper?.destroy(); URL.revokeObjectURL(url); modal.remove(); };
    modal.querySelector('#cropClose').onclick = close;
    modal.querySelector('#cropCancel').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#cropSave').addEventListener('click', () => {
      const canvas = cropper.getCroppedCanvas({ maxWidth: 1600, maxHeight: 1600 });
      if (!canvas) return;
      canvasToBlobCompat(canvas, (blob) => { if (blob) onDone?.(blob); close(); });
    });
  }

  // Input'a kırpılmış dosyayı güvenle yerleştir (Safari uyumlu DataTransfer)
  function replaceInputFile(inputEl, origName, blob) {
    const f = new File([blob], origName || 'image.jpg', { type: blob.type || 'image/jpeg' });
    try {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputEl.files = dt.files;
    } catch {
      // Safari eski sürümler fallback: form submit sırasında FormData.set ile ekleyeceğiz
    }
    return f;
  }

  // Çoklu silme sistemi
  const setupBulkDeleteSystem = () => {
    const selectAllCheckbox = document.getElementById('selectAllProducts');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const bulkDeleteCount = document.getElementById('bulkDeleteCount');
    
    if (!selectAllCheckbox || !bulkDeleteBtn || !bulkDeleteCount) return;
    
    // Tümünü seç/bırak
    selectAllCheckbox.addEventListener('change', (e) => {
      const productCheckboxes = document.querySelectorAll('.product-checkbox');
      productCheckboxes.forEach(cb => {
        cb.checked = e.target.checked;
      });
      updateBulkDeleteUI();
    });
    
    // Toplu silme butonu
    bulkDeleteBtn.addEventListener('click', async () => {
      const selectedIds = getSelectedProductIds();
      console.log('🗑️ Toplu silme başlatıldı');
      console.log('📋 Seçili ID\'ler:', selectedIds);
      
      if (selectedIds.length === 0) {
        console.log('⚠️ Seçili ürün bulunamadı');
        return;
      }
      
      const confirmMessage = `${selectedIds.length} ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`;
      if (!confirm(confirmMessage)) {
        console.log('❌ Kullanıcı işlemi iptal etti');
        return;
      }
      
      try {
        console.log('🚀 API çağrısı yapılıyor...');
        const requestBody = { productIds: selectedIds };
        console.log('📤 Request body:', requestBody);
        
        const res = await authFetch('/api/products/bulk', {
          method: 'DELETE',
          body: JSON.stringify(requestBody)
        });
        
        if (!res) {
          console.error('❌ authFetch null döndürdü');
          return;
        }
        
        console.log('📡 API response alındı, status:', res.status);
        
        if (res.status === 401) {
          console.error('❌ 401 Unauthorized hatası');
          alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
          localStorage.removeItem('token');
          window.location.href = '/admin/login.html';
          return;
        }
        
        const data = await res.json();
        console.log('📋 API response data:', data);
        
        if (!res.ok) {
          console.error('❌ API response başarısız, status:', res.status, 'message:', data.message);
          alert(`Silme işlemi başarısız: ${data.message || 'Bilinmeyen hata'}`);
          return;
        }
        
        console.log('✅ Toplu silme başarılı, silinen ürün sayısı:', data.deletedCount);
        alert(`${data.deletedCount} ürün başarıyla silindi!`);
        
        // Seçimleri temizle
        selectAllCheckbox.checked = false;
        updateBulkDeleteUI();
        
        // Ürün listesini yenile
        await loadProducts();
        
      } catch (error) {
        console.error('❌ Toplu silme hatası:', error);
        alert('Ürünler silinirken bir hata oluştu');
      }
    });
  };

  // Seçili ürün ID'lerini al
  const getSelectedProductIds = () => {
    console.log('🔍 Seçili ürün ID\'leri aranıyor...');
    const checkboxes = document.querySelectorAll('.product-checkbox:checked');
    console.log('📋 Bulunan checkbox sayısı:', checkboxes.length);
    
    const selectedIds = Array.from(checkboxes).map(cb => {
      const id = cb.value;
      console.log('✅ Seçili checkbox ID:', id, 'value:', cb.value);
      return id;
    });
    
    console.log('📊 Toplam seçili ID sayısı:', selectedIds.length);
    console.log('📋 Seçili ID\'ler:', selectedIds);
    
    return selectedIds;
  };

  // Toplu silme UI'sını güncelle
  const updateBulkDeleteUI = () => {
    const selectedCount = getSelectedProductIds().length;
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const bulkDeleteCount = document.getElementById('bulkDeleteCount');
    
    if (bulkDeleteBtn && bulkDeleteCount) {
      bulkDeleteCount.textContent = selectedCount;
      
      if (selectedCount > 0) {
        bulkDeleteBtn.classList.remove('hidden');
        bulkDeleteBtn.classList.add('inline-flex');
      } else {
        bulkDeleteBtn.classList.add('hidden');
        bulkDeleteBtn.classList.remove('inline-flex');
      }
    }
  };

  // Şifre değiştirme fonksiyonları
  const initPasswordChange = () => {
    const form = document.getElementById('changePasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const strengthIndicator = document.getElementById('passwordStrength');
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    const successMessage = document.getElementById('passwordChangeSuccess');
    const errorMessage = document.getElementById('passwordChangeError');
    const errorText = document.getElementById('passwordErrorText');

    if (!form) return;

    // Şifre gücü kontrolü
    const checkPasswordStrength = (password) => {
      let strength = 0;
      const checks = {
        length: password.length >= 8,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        numbers: /\d/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
      };

      strength = Object.values(checks).filter(Boolean).length;

      const levels = [
        { min: 0, max: 1, text: 'Çok Zayıf', color: 'bg-red-500', width: '20%' },
        { min: 2, max: 2, text: 'Zayıf', color: 'bg-orange-500', width: '40%' },
        { min: 3, max: 3, text: 'Orta', color: 'bg-yellow-500', width: '60%' },
        { min: 4, max: 4, text: 'Güçlü', color: 'bg-blue-500', width: '80%' },
        { min: 5, max: 5, text: 'Çok Güçlü', color: 'bg-green-500', width: '100%' }
      ];

      const level = levels.find(l => strength >= l.min && strength <= l.max);
      return level;
    };

    // Şifre inputu değişikliklerini dinle
    newPasswordInput?.addEventListener('input', (e) => {
      const password = e.target.value;
      
      if (password.length > 0) {
        strengthIndicator.classList.remove('hidden');
        const strength = checkPasswordStrength(password);
        
        strengthBar.className = `h-2 rounded-full transition-all duration-300 ${strength.color}`;
        strengthBar.style.width = strength.width;
        strengthText.textContent = strength.text;
        strengthText.className = `text-xs mt-1 ${strength.color.replace('bg-', 'text-')}`;
      } else {
        strengthIndicator.classList.add('hidden');
      }
    });

    // Şifre eşleşmesi kontrolü
    const checkPasswordMatch = () => {
      const newPass = newPasswordInput?.value;
      const confirmPass = confirmPasswordInput?.value;
      
      if (confirmPass && newPass !== confirmPass) {
        confirmPasswordInput.setCustomValidity('Şifreler eşleşmiyor');
        confirmPasswordInput.classList.add('border-red-500');
      } else {
        confirmPasswordInput.setCustomValidity('');
        confirmPasswordInput.classList.remove('border-red-500');
      }
    };

    confirmPasswordInput?.addEventListener('input', checkPasswordMatch);
    newPasswordInput?.addEventListener('input', checkPasswordMatch);

    // Form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(form);
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      // Validation
      if (newPassword !== confirmPassword) {
        showPasswordError('Şifreler eşleşmiyor');
        return;
      }

      if (newPassword.length < 6) {
        showPasswordError('Yeni şifre en az 6 karakter olmalı');
        return;
      }

      // Hide previous messages
      hidePasswordMessages();

      const submitBtn = document.getElementById('changePasswordBtn');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Değiştiriliyor...';

      try {
        const response = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            currentPassword,
            newPassword
          })
        });

        const data = await response.json();

        if (response.ok) {
          showPasswordSuccess('Şifre başarıyla değiştirildi ve kalıcı olarak kaydedildi! Hemen yeni şifrenizle giriş yapabilirsiniz.');
          form.reset();
          strengthIndicator.classList.add('hidden');
          
          // Başarılı mesajını console'a da yazdır
          console.log('✅ Şifre değişikliği başarılı!');
          if (data.note) {
            console.log('💡 Not:', data.note);
          }
          
        } else {
          showPasswordError(data.message || 'Şifre değiştirme başarısız');
        }

      } catch (error) {
        console.error('Şifre değiştirme hatası:', error);
        showPasswordError('Bağlantı hatası oluştu');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    const showPasswordSuccess = (message = 'Şifre başarıyla değiştirildi!') => {
      hidePasswordMessages();
      if (successMessage) {
        // Mesajı güncelle
        const messageSpan = successMessage.querySelector('span');
        if (messageSpan) {
          messageSpan.textContent = message;
        }
        successMessage.classList.remove('hidden');
        setTimeout(() => {
          successMessage.classList.add('hidden');
        }, 8000); // Daha uzun göster
      }
    };

    const showPasswordError = (message) => {
      hidePasswordMessages();
      if (errorText) errorText.textContent = message;
      errorMessage?.classList.remove('hidden');
      setTimeout(() => {
        errorMessage?.classList.add('hidden');
      }, 5000);
    };

    const hidePasswordMessages = () => {
      successMessage?.classList.add('hidden');
      errorMessage?.classList.add('hidden');
    };
  };

  // DOM yüklendiğinde şifre değiştirme sistemini başlat
  document.addEventListener('DOMContentLoaded', () => {
    // Diğer init fonksiyonları...
    initPasswordChange();
  });

  // Global fonksiyonlar (HTML onclick'ler için) - Tüm fonksiyonlar tanımlandıktan sonra
  window.setMainImage = setMainImage;
  window.removeProductImage = removeProductImage;

  // Arama ve filtreleme fonksiyonları
  const applyProductFilters = () => {
    console.log('🔍 applyProductFilters başlatıldı');
    console.log('📊 allProducts:', allProducts);
    
    if (!allProducts || allProducts.length === 0) {
      console.log('⚠️ allProducts boş veya tanımsız');
      return;
    }
    
    console.log('📋 Filtreleme öncesi ürün sayısı:', allProducts.length);
    
    // Arama sorgusu
    const searchQuery = currentSearchQuery.toLowerCase().trim();
    console.log('🔎 Arama sorgusu:', searchQuery);
    
    // Filtreleme
    filteredProducts = allProducts.filter(product => {
      // Arama filtresi
      const matchesSearch = !searchQuery || 
        product.name?.toLowerCase().includes(searchQuery) ||
        product.description?.toLowerCase().includes(searchQuery) ||
        product.categoryId?.name?.toLowerCase().includes(searchQuery);
      
      // Kategori filtresi
      const matchesCategory = !currentCategoryFilter || 
        product.categoryId?._id === currentCategoryFilter;
      
      // Stok filtresi
      let matchesStock = true;
      if (currentStockFilter) {
        const totalStock = product.sizeStocks?.reduce((sum, s) => sum + Number(s.stock || 0), 0) || product.stock || 0;
        
        switch (currentStockFilter) {
          case 'inStock':
            matchesStock = totalStock > 10;
            break;
          case 'lowStock':
            matchesStock = totalStock > 0 && totalStock <= 10;
            break;
          case 'outOfStock':
            matchesStock = totalStock === 0;
            break;
        }
      }
      
      return matchesSearch && matchesCategory && matchesStock;
    });
    
    console.log('✅ Filtreleme sonrası ürün sayısı:', filteredProducts.length);
    
    // Sıralama
    sortProducts();
    
    // Tabloyu güncelle
    console.log('📊 renderProductTable çağrılıyor...');
    renderProductTable();
    
    // Sonuç sayısını güncelle
    updateProductResultsCount();
  };

  const sortProducts = () => {
    if (!filteredProducts || filteredProducts.length === 0) return;
    
    filteredProducts.sort((a, b) => {
      switch (currentSortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '', 'tr');
        case 'price':
          return (a.price || 0) - (b.price || 0);
        case 'stock':
          const stockA = a.sizeStocks?.reduce((sum, s) => sum + Number(s.stock || 0), 0) || a.stock || 0;
          const stockB = b.sizeStocks?.reduce((sum, s) => sum + Number(s.stock || 0), 0) || b.stock || 0;
          return stockB - stockA; // Yüksek stok önce
        case 'createdAt':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        default:
          return 0;
      }
    });
  };

  const renderProductTable = () => {
    console.log('📊 renderProductTable başlatıldı');
    console.log('🔍 prodTableBody:', prodTableBody);
    console.log('📋 filteredProducts:', filteredProducts);
    
    if (!prodTableBody) {
      console.error('❌ prodTableBody bulunamadı');
      return;
    }
    
    console.log('🧹 Tablo temizleniyor...');
    prodTableBody.innerHTML = '';
    
    if (filteredProducts.length === 0) {
      console.log('⚠️ Filtrelenmiş ürün bulunamadı, boş mesaj gösteriliyor');
      prodTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="py-8 text-center text-slate-500">
            <div class="flex flex-col items-center gap-2">
              <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <p class="text-lg font-medium">Ürün bulunamadı</p>
              <p class="text-sm">Arama kriterlerinizi değiştirmeyi deneyin</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    console.log('✅ Ürün satırları oluşturuluyor, sayı:', filteredProducts.length);
    
    filteredProducts.forEach((product, index) => {
      console.log(`📝 Ürün ${index + 1} satırı oluşturuluyor:`, product.name);
      const row = renderProductRow(product);
      prodTableBody.appendChild(row);
    });
    
    console.log('✅ Tüm ürün satırları eklendi');
    
    // Event listener'ları ekle
    setupProductRowEventListeners();
    
    // Mobil kart görünümünü de güncelle
    updateMobileProductCards();
  };

  const setupProductRowEventListeners = () => {
    // Checkbox event listener'larını ekle
    prodTableBody.querySelectorAll('.product-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', updateBulkDeleteUI);
    });

    // Düzenleme butonları
    prodTableBody.querySelectorAll('.prod-edit').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          const editingProductId = btn.dataset.id;
          console.log('Düzenleme başlatılıyor, productId:', editingProductId);
          
          if (!editingProductId) {
            console.error('Product ID bulunamadı');
            return;
          }
          
          const res = await authFetch(`/api/products/admin/all`);
          if (!res) return; // authFetch hata döndürdüyse çık
          
          if (res.status === 401) {
            alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
            localStorage.removeItem('token');
            window.location.href = '/admin/login.html';
            return;
          }
          const products = await res.json();
          const p = products.find(i=>i._id===editingProductId);
          if (!p) {
            console.error('Ürün bulunamadı:', editingProductId);
            return;
          }
          console.log('Düzenlenecek ürün:', p);
          console.log('Modal açılıyor...');
          openProductModal(editingProductId);
          console.log('Modal açıldı, prodModal element:', prodModal);
          
          // Form alanlarını doldur
          fillProductForm(p);
          
        } catch (error) {
          console.error('Düzenleme sırasında detaylı hata:', error);
          alert(`Ürün düzenlenirken bir hata oluştu: ${error.message}`);
        }
      })
    );

    // Silme butonları
    prodTableBody.querySelectorAll('.prod-del').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Ürünü silmek istediğinize emin misiniz?')) return;
        await authFetch(`/api/products/${btn.dataset.id}`, { method: 'DELETE' });
        await loadProducts();
      })
    );


  };

  // Bildirim gösterme fonksiyonu
  const showNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
    
    // Tip'e göre stil
    switch (type) {
      case 'success':
        notification.className += ' bg-green-500 text-white';
        break;
      case 'error':
        notification.className += ' bg-red-500 text-white';
        break;
      case 'warning':
        notification.className += ' bg-yellow-500 text-white';
        break;
      default:
        notification.className += ' bg-blue-500 text-white';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animasyon
    setTimeout(() => notification.classList.remove('translate-x-full'), 100);
    
    // Otomatik kaldır
    setTimeout(() => {
      notification.classList.add('translate-x-full');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  const fillProductForm = (product) => {
    // Form alanlarını doldur
    const nameInput = prodForm.querySelector('[name="name"]');
    const descInput = prodForm.querySelector('[name="description"]');
    const priceInput = prodForm.querySelector('[name="price"]');
    const mainColorInput = prodForm.querySelector('[name="mainColor"]');
    const mainColorHexInput = prodForm.querySelector('[name="mainColorHex"]');
    
    if (nameInput) nameInput.value = product.name || '';
    if (descInput) {
      descInput.value = product.description || '';
      // Textarea yüksekliğini içeriğe göre ayarla
      setTimeout(() => {
        descInput.style.height = 'auto';
        descInput.style.height = descInput.scrollHeight + 'px';
      }, 50);
    }
    if (priceInput) priceInput.value = product.price || '';
    if (mainColorInput) mainColorInput.value = product.mainColor || '';
    if (mainColorHexInput) mainColorHexInput.value = product.mainColorHex || '#000000';
    

    
    // Kategori seçimi
    const catSelect = document.getElementById('prodCat');
    if (catSelect && product.categoryId?._id) catSelect.value = product.categoryId._id;
    
    // Görselleri yükle
    loadProductImages(product);
    
    // Beden stoklarını yükle
    loadProductSizeStocks(product);
    
    // Varyantları yükle
    loadProductVariants(product);
  };

  const loadProductImages = (product) => {
    if (product.images && product.images.length > 0) {
      productImages = product.images.map((img, index) => ({
        id: Date.now() + index,
        file: null,
        name: img.name || `Görsel ${index + 1}`,
        size: 0,
        isMain: img.isMain || index === 0,
        url: img.url
      }));
    } else if (product.imageUrl) {
      productImages = [{
        id: Date.now(),
        name: 'Mevcut Görsel',
        size: 0,
        isMain: true,
        url: product.imageUrl
      }];
    } else {
      productImages = [];
    }
    
    if (typeof renderProductImages === 'function') {
      renderProductImages();
    }
    if (typeof updateImageControls === 'function') {
      updateImageControls();
    }
  };

  const loadProductSizeStocks = (product) => {
    if (sizeStocksContainer) {
      sizeStocksContainer.innerHTML = '';
      if (product.sizeStocks?.length) {
        product.sizeStocks.forEach((s) => addSizeRow({ size: s.size, stock: s.stock }));
      } else {
        addSizeRow();
      }
    }
  };

  const loadProductVariants = (product) => {
    if (variantsContainer) {
      variantsContainer.innerHTML = '';
      
      // Bu ürünün varyantlarını bul
      const productVariants = allProducts.filter(variant => 
        variant.parentProductId === product._id && variant.isVariant === true
      );
      
      if (productVariants.length > 0) {
        console.log('Loading product variants:', productVariants.length);
        productVariants.forEach((variant) => {
          if (typeof addVariant === 'function') {
            addVariant({
              color: variant.variantColor || variant.mainColor,
              colorHex: variant.mainColorHex || '#000000',
              images: variant.images || [],
              sizeStocks: variant.sizeStocks || []
            });
          }
        });
      } else {
        if (typeof addVariant === 'function') {
          addVariant();
        }
      }
    }
  };

  const updateProductResultsCount = () => {
    const resultsCount = document.getElementById('productResultsCount');
    if (resultsCount) {
      resultsCount.textContent = filteredProducts.length;
    }
  };

  const updateCategoryFilter = () => {
    const categoryFilter = document.getElementById('categoryFilter');
    if (!categoryFilter) return;
    
    // Mevcut seçimi sakla
    const currentValue = categoryFilter.value;
    
    // Kategorileri yükle
    const categories = allProducts
      .map(p => p.categoryId)
      .filter((cat, index, arr) => cat && arr.findIndex(c => c._id === cat._id) === index);
    
    // Mevcut seçenekleri temizle (ilk seçenek hariç)
    while (categoryFilter.children.length > 1) {
      categoryFilter.removeChild(categoryFilter.lastChild);
    }
    
    // Yeni kategorileri ekle
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat._id;
      option.textContent = cat.name;
      categoryFilter.appendChild(option);
    });
    
    // Önceki seçimi geri yükle
    if (currentValue) {
      categoryFilter.value = currentValue;
    }
  };

  // Event listener'ları kur
  const setupProductSearchAndFilters = () => {
    const searchInput = document.getElementById('productSearchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const stockFilter = document.getElementById('stockFilter');
    const sortSelect = document.getElementById('productSortSelect');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    
    // Arama input'u
    searchInput?.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value;
      applyProductFilters();
    });
    
    // Kategori filtresi
    categoryFilter?.addEventListener('change', (e) => {
      currentCategoryFilter = e.target.value;
      applyProductFilters();
    });
    
    // Stok filtresi
    stockFilter?.addEventListener('change', (e) => {
      currentStockFilter = e.target.value;
      applyProductFilters();
    });
    
    // Sıralama
    sortSelect?.addEventListener('change', (e) => {
      currentSortBy = e.target.value;
      applyProductFilters();
    });
    
    // Filtreleri temizle
    clearFiltersBtn?.addEventListener('click', () => {
      currentSearchQuery = '';
      currentCategoryFilter = '';
      currentStockFilter = '';
      currentSortBy = 'name';
      
      // Input'ları temizle
      if (searchInput) searchInput.value = '';
      if (categoryFilter) categoryFilter.value = '';
      if (stockFilter) stockFilter.value = '';
      if (sortSelect) sortSelect.value = 'name';
      
      // Filtreleri uygula
      applyProductFilters();
    });
  };

  // Mobil menü fonksiyonları
  const openMobileMenu = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    if (sidebar) {
      sidebar.classList.remove('-translate-x-full');
      sidebar.classList.add('translate-x-0');
    }
    
    if (overlay) {
      overlay.classList.remove('hidden');
    }
    
    document.body.style.overflow = 'hidden';
  };

  const closeMobileMenu = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    if (sidebar) {
      sidebar.classList.add('-translate-x-full');
      sidebar.classList.remove('translate-x-0');
    }
    
    if (overlay) {
      overlay.classList.add('hidden');
    }
    
    document.body.style.overflow = 'auto';
  };

  // Mobil menü event listener'ları
  const setupMobileMenu = () => {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const closeSidebar = document.getElementById('closeSidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');
    
    mobileMenuToggle?.addEventListener('click', openMobileMenu);
    closeSidebar?.addEventListener('click', closeMobileMenu);
    mobileOverlay?.addEventListener('click', closeMobileMenu);
    
    // ESC tuşu ile kapatma
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMobileMenu();
      }
    });
  };

  // Mobil kart görünümü için ürün kartı oluşturma
  const createProductCard = (product) => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow';
    
    // Toplam stok hesapla
    const totalStock = product.sizeStocks?.reduce((sum, s) => sum + Number(s.stock || 0), 0) || product.stock || 0;
    
    // Stok durumu rengi
    const stockColor = totalStock > 10 ? 'text-green-600' : totalStock > 0 ? 'text-yellow-600' : 'text-red-600';
    
    card.innerHTML = `
      <div class="space-y-3">
        <!-- Üst Kısım: Checkbox, Görsel ve Temel Bilgiler -->
        <div class="flex items-start gap-3">
          <!-- Checkbox -->
          <div class="pt-1">
            <input type="checkbox" value="${product._id}" class="product-checkbox rounded border-slate-300 text-[#CBA135] focus:ring-[#CBA135]" />
          </div>
          
          <!-- Ürün Görseli -->
          <div class="flex-shrink-0">
            <div class="w-24 h-24 rounded-lg overflow-hidden bg-slate-100">
              <img src="${product.images?.[0]?.url || product.imageUrl || 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop'}" 
                   alt="${product.name}" 
                   class="w-full h-full object-cover" />
            </div>
          </div>
          
          <!-- Ürün Temel Bilgileri -->
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-slate-800 text-sm leading-tight mb-1">${product.name}</h3>
            <p class="text-xs text-slate-500 mb-2">${product.categoryId?.name || 'Kategori Yok'}</p>
            
            <!-- Fiyat -->
            <div class="text-sm font-semibold text-slate-800">
              ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(product.price)}
            </div>
          </div>
        </div>
        
        <!-- Orta Kısım: Beden ve Stok Detayları -->
        <div class="pl-19">
          <!-- Beden ve Stok Bilgileri -->
          <div class="bg-slate-50 rounded-lg p-3 mb-3">
            <div class="text-xs font-medium text-slate-600 mb-2">Beden Stokları:</div>
            <div class="grid grid-cols-2 gap-2">
              ${product.sizeStocks?.length ? 
                product.sizeStocks.map(s => `
                  <div class="flex items-center justify-between bg-white px-2 py-1 rounded border">
                    <span class="text-xs font-mono text-slate-700">${s.size}</span>
                    <span class="text-xs font-medium ${Number(s.stock) > 5 ? 'text-green-600' : Number(s.stock) > 0 ? 'text-yellow-600' : 'text-red-600'}">${s.stock}</span>
                  </div>
                `).join('') : 
                `<div class="text-xs text-slate-400 col-span-2 text-center py-2">Beden bilgisi yok</div>`
              }
            </div>
          </div>
          
          <!-- Toplam Stok -->
          <div class="flex items-center justify-between bg-slate-100 rounded-lg px-3 py-2 mb-3">
            <span class="text-xs font-medium text-slate-600">Toplam Stok:</span>
            <span class="text-sm font-bold ${stockColor}">${totalStock} adet</span>
          </div>
        </div>
        
        <!-- Alt Kısım: İşlem Butonları - Tamamen Ayrı Bölüm -->
        <div class="mt-4 pt-4 border-t border-slate-200 bg-slate-50 rounded-lg p-3">
          <div class="flex items-center gap-2">
            <button data-id="${product._id}" class="prod-edit flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors font-medium bg-white">
              Düzenle
            </button>
            <button data-id="${product._id}" class="prod-del flex-1 px-3 py-2 text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors font-medium bg-white">
              Sil
            </button>
          </div>
        </div>
      </div>
    `;
    
    return card;
  };

  // Mobil kart görünümünü güncelle
  const updateMobileProductCards = () => {
    const cardsContainer = document.getElementById('prodCardsContainer');
    if (!cardsContainer) return;
    
    cardsContainer.innerHTML = '';
    
    if (filteredProducts.length === 0) {
      cardsContainer.innerHTML = `
        <div class="text-center py-8 text-slate-500">
          <div class="flex flex-col items-center gap-2">
            <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <p class="text-lg font-medium">Ürün bulunamadı</p>
            <p class="text-sm">Arama kriterlerinizi değiştirmeyi deneyin</p>
          </div>
        </div>
      `;
      return;
    }
    
    filteredProducts.forEach((product) => {
      const card = createProductCard(product);
      cardsContainer.appendChild(card);
    });
    
    // Mobil kartlarda event listener'ları ekle
    setupMobileCardEventListeners();
  };

  // Mobil kartlarda event listener'ları kur
  const setupMobileCardEventListeners = () => {
    const cardsContainer = document.getElementById('prodCardsContainer');
    if (!cardsContainer) return;
    
    // Checkbox event listener'larını ekle
    cardsContainer.querySelectorAll('.product-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', updateBulkDeleteUI);
    });

    // Düzenleme butonları
    cardsContainer.querySelectorAll('.prod-edit').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          const editingProductId = btn.dataset.id;
          console.log('Düzenleme başlatılıyor, productId:', editingProductId);
          
          if (!editingProductId) {
            console.error('Product ID bulunamadı');
            return;
          }
          
          const res = await authFetch(`/api/products/admin/all`);
          if (!res) return; // authFetch hata döndürdüyse çık
          
          if (res.status === 401) {
            alert('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
            localStorage.removeItem('token');
            window.location.href = '/admin/login.html';
            return;
          }
          const products = await res.json();
          const p = products.find(i=>i._id===editingProductId);
          if (!p) {
            console.error('Ürün bulunamadı:', editingProductId);
            return;
          }
          console.log('Düzenlenecek ürün:', p);
          console.log('Modal açılıyor...');
          openProductModal(editingProductId);
          console.log('Modal açıldı, prodModal element:', prodModal);
          
          // Form alanlarını doldur
          fillProductForm(p);
          
        } catch (error) {
          console.error('Düzenleme sırasında detaylı hata:', error);
          alert(`Ürün düzenlenirken bir hata oluştu: ${error.message}`);
        }
      })
    );

    // Silme butonları
    cardsContainer.querySelectorAll('.prod-del').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Ürünü silmek istediğinize emin misiniz?')) return;
        await authFetch(`/api/products/${btn.dataset.id}`, { method: 'DELETE' });
        await loadProducts();
      })
    );
  };



  // Modal durum bilgisini güncelle
  const updateModalStatus = () => {
    const statusText = document.getElementById('modalStatusText');
    if (statusText && prodModal) {
      const isHidden = prodModal.classList.contains('hidden');
      const isFlex = prodModal.classList.contains('flex');
      
      if (isHidden) {
        statusText.textContent = 'Kapalı';
        statusText.className = 'text-red-600 font-medium';
      } else if (isFlex) {
        statusText.textContent = 'Açık';
        statusText.className = 'text-green-600 font-medium';
      } else {
        statusText.textContent = 'Bilinmiyor';
        statusText.className = 'text-yellow-600 font-medium';
      }
    }
  };
  
  // Textarea otomatik yükseklik ayarlaması
  const setupTextareaAutoResize = () => {
    const descriptionTextarea = document.querySelector('[name="description"]');
    if (descriptionTextarea) {
      // Başlangıçta yüksekliği ayarla
      descriptionTextarea.style.height = 'auto';
      descriptionTextarea.style.height = descriptionTextarea.scrollHeight + 'px';
      
      // Input event'inde yüksekliği güncelle
      descriptionTextarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
      
      // Focus event'inde de yüksekliği güncelle
      descriptionTextarea.addEventListener('focus', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    }
  };

  // DOM yüklendiğinde arama sistemini kur
  document.addEventListener('DOMContentLoaded', () => {
    setupProductSearchAndFilters();
    setupMobileMenu();
    setupTextareaAutoResize();
  });

  // Kampanya Sistemi
  let allCampaigns = [];
  let editingCampaignId = null;

  // Kampanya tipi değiştiğinde form alanlarını göster/gizle
  const setupCampaignTypeToggle = () => {
    const campaignType = document.getElementById('campaignType');
    const categorySelection = document.getElementById('categorySelection');
    const productSelection = document.getElementById('productSelection');
    
    if (campaignType) {
      campaignType.addEventListener('change', () => {
        const type = campaignType.value;
        
        if (type === 'category') {
          categorySelection.classList.remove('hidden');
          productSelection.classList.add('hidden');
        } else if (type === 'products') {
          categorySelection.classList.add('hidden');
          productSelection.classList.remove('hidden');
        } else {
          categorySelection.classList.add('hidden');
          productSelection.classList.add('hidden');
        }
      });
    }
  };

  // Kampanya form submit
  const setupCampaignForm = () => {
    const campaignForm = document.getElementById('campaignForm');
    
    if (campaignForm) {
      console.log('✅ Kampanya form setup edildi');
      
      campaignForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('🚀 Kampanya form submit edildi');
        
        try {
          const formData = new FormData(campaignForm);
          const type = formData.get('type');
          console.log('📝 Form verileri:', { type });
          
          // Kampanya tipine göre validasyon
          if (type === 'category') {
            const targetId = formData.get('targetId');
            console.log('🎯 Kategori ID:', targetId);
            if (!targetId) {
              alert('Kategori seçimi zorunludur');
              return;
            }
          } else if (type === 'products') {
            const selectedProducts = document.querySelectorAll('#campaignProductsList input[type="checkbox"]:checked');
            console.log('📦 Seçilen ürünler:', selectedProducts.length);
            if (selectedProducts.length === 0) {
              alert('En az bir ürün seçilmelidir');
              return;
            }
            
            const productIds = Array.from(selectedProducts).map(cb => cb.value);
            formData.set('productIds', JSON.stringify(productIds));
            console.log('🆔 Ürün ID\'leri:', productIds);
          }
          
          const url = editingCampaignId ? `/api/campaigns/${editingCampaignId}` : '/api/campaigns';
          const method = editingCampaignId ? 'PUT' : 'POST';
          console.log('🌐 API çağrısı:', method, url);
          
          // FormData içeriğini logla
          console.log('📋 FormData içeriği:');
          for (let [key, value] of formData.entries()) {
            console.log(`${key}:`, value);
          }
          
          const res = await fetch(url, { 
            method, 
            headers: { Authorization: `Bearer ${token}` }, 
            body: formData 
          });
          
          console.log('📡 API response status:', res.status);
          
          if (res.ok) {
            const campaign = await res.json();
            console.log('✅ Kampanya başarıyla kaydedildi:', campaign);
            alert(editingCampaignId ? 'Kampanya başarıyla güncellendi!' : 'Kampanya başarıyla eklendi!');
            
            // Form temizle
            campaignForm.reset();
            editingCampaignId = null;
            
            // Kampanya listesini yenile
            loadCampaigns();
          } else {
            const error = await res.json();
            console.error('❌ API hatası:', error);
            alert(`Hata: ${error.message}`);
          }
        } catch (error) {
          console.error('❌ Kampanya kaydedilirken hata:', error);
          alert('Kampanya kaydedilirken bir hata oluştu');
        }
      });
    } else {
      console.error('❌ Kampanya form bulunamadı!');
    }
  };

  // Kampanyaları yükle
  const loadCampaigns = async () => {
    try {
      const campaigns = await fetch('/api/campaigns/admin/all', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => res.json());
      
      allCampaigns = campaigns;
      renderCampaigns(campaigns);
    } catch (error) {
      console.error('Kampanyalar yüklenirken hata:', error);
    }
  };

  // Kampanyaları render et
  const renderCampaigns = (campaigns) => {
    const campaignList = document.getElementById('campaignList');
    
    if (!campaignList) return;
    
    if (campaigns.length === 0) {
      campaignList.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <p class="text-lg font-medium">Henüz kampanya eklenmemiş</p>
          <p class="text-sm">İlk kampanyanızı ekleyerek başlayın</p>
        </div>
      `;
      return;
    }
    
    const campaignsHTML = campaigns.map(campaign => `
      <div class="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h3 class="text-lg font-semibold text-slate-800">${campaign.name}</h3>
              <span class="px-2 py-1 text-xs font-medium rounded-full ${
                campaign.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }">
                ${campaign.isActive ? 'Aktif' : 'Pasif'}
              </span>
              <span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                ${campaign.type === 'category' ? 'Kategori' : 'Ürün'} Kampanyası
              </span>
            </div>
            
            <p class="text-slate-600 mb-3">${campaign.description || 'Açıklama yok'}</p>
            
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-slate-500">Başlangıç:</span>
                <span class="font-medium">${new Date(campaign.startDate).toLocaleDateString('tr-TR')}</span>
              </div>
              <div>
                <span class="text-sm text-slate-500">Bitiş:</span>
                <span class="font-medium">${new Date(campaign.endDate).toLocaleDateString('tr-TR')}</span>
              </div>
              <div>
                <span class="text-slate-500">İndirim:</span>
                <span class="font-medium">%${campaign.discount || 0}</span>
              </div>
              <div>
                <span class="text-slate-500">Öncelik:</span>
                <span class="font-medium">${campaign.priority}</span>
              </div>
            </div>
            
            ${campaign.type === 'category' && campaign.targetId ? `
              <div class="mt-3">
                <span class="text-slate-500">Hedef Kategori:</span>
                <span class="font-medium text-accent-600">${campaign.targetId.name}</span>
              </div>
            ` : ''}
            
            ${campaign.type === 'products' && campaign.productIds && campaign.productIds.length > 0 ? `
              <div class="mt-3">
                <span class="text-slate-500">Hedef Ürünler:</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  ${campaign.productIds.map(product => `
                    <span class="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded">${product.name}</span>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
          
          <div class="flex items-center gap-3 ml-4">
            ${campaign.imageUrl ? `
              <div class="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                <img src="${campaign.imageUrl}" alt="${campaign.name}" class="w-full h-full object-cover">
              </div>
            ` : `
              <div class="w-16 h-16 rounded-lg border border-slate-200 flex-shrink-0 bg-slate-100 flex items-center justify-center">
                <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
            `}
            
            <div class="flex items-center gap-2">
              <button onclick="editCampaign('${campaign._id}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
              <button onclick="deleteCampaign('${campaign._id}')" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
    
    campaignList.innerHTML = campaignsHTML;
  };

  // Kampanya düzenle
  const editCampaign = (campaignId) => {
    const campaign = allCampaigns.find(c => c._id === campaignId);
    if (!campaign) return;
    
    editingCampaignId = campaignId;
    
    // Form'u doldur
    const form = document.getElementById('campaignForm');
    form.name.value = campaign.name;
    form.description.value = campaign.description || '';
    form.startDate.value = new Date(campaign.startDate).toISOString().slice(0, 16);
    form.endDate.value = new Date(campaign.endDate).toISOString().slice(0, 16);
    form.type.value = campaign.type;
    form.discount.value = campaign.discount || 0;
    form.priority.value = campaign.priority || 1;
    
    // Kampanya tipine göre alanları göster
    const campaignType = document.getElementById('campaignType');
    campaignType.dispatchEvent(new Event('change'));
    
    if (campaign.type === 'category' && campaign.targetId) {
      form.targetId.value = campaign.targetId._id;
    } else if (campaign.type === 'products' && campaign.productIds) {
      // Ürün checkbox'larını işaretle
      campaign.productIds.forEach(product => {
        const checkbox = document.querySelector(`#campaignProductsList input[value="${product._id}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
    
    // Kampanya görselini göster (eğer varsa)
    if (campaign.imageUrl) {
      const campaignImagePreview = document.getElementById('campaignImagePreview');
      const campaignDropZone = document.getElementById('campaignDropZone');
      
      if (campaignImagePreview && campaignDropZone) {
        campaignImagePreview.src = campaign.imageUrl;
        campaignImagePreview.classList.remove('hidden');
        
        // Drop zone'u güncelle
        campaignDropZone.innerHTML = `
          <div class="text-center">
            <img src="${campaign.imageUrl}" alt="Kampanya Görseli" class="max-h-32 mx-auto rounded-lg mb-2">
            <p class="text-sm text-slate-500">Mevcut Görsel</p>
            <button type="button" id="removeCampaignImageBtn" class="text-red-600 underline text-sm mt-2">Görseli Kaldır</button>
          </div>
        `;
        
        // Görsel kaldır butonuna event listener ekle
        const removeBtn = document.getElementById('removeCampaignImageBtn');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            campaignImagePreview.classList.add('hidden');
            resetCampaignDropZone();
          });
        }
      }
    }
    
    // Submit butonunu güncelle
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Kampanyayı Güncelle';
    
    // Sayfayı yukarı scroll yap
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Kampanya sil
  const deleteCampaign = async (campaignId) => {
    if (!confirm('Bu kampanyayı silmek istediğinizden emin misiniz?')) return;
    
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        alert('Kampanya başarıyla silindi!');
        loadCampaigns();
      } else {
        const error = await res.json();
        alert(`Hata: ${error.message}`);
      }
    } catch (error) {
      console.error('Kampanya silinirken hata:', error);
      alert('Kampanya silinirken bir hata oluştu');
    }
  };

  // Kampanya sekmesi açıldığında gerekli setup'ları yap
  const setupCampaignsTab = () => {
    setupCampaignTypeToggle();
    setupCampaignForm();
    setupCampaignImageUpload();
    loadCampaigns();
    
    // Kategorileri yükle
    loadCategoriesForCampaign();
    
    // Ürünleri yükle
    loadProductsForCampaign();
  };

  // Kampanya için kategorileri yükle
  const loadCategoriesForCampaign = async () => {
    try {
      const categories = await fetch('/api/categories').then(res => res.json());
      const campaignCategory = document.getElementById('campaignCategory');
      
      if (campaignCategory) {
        campaignCategory.innerHTML = '<option value="">Kategori seçiniz</option>' +
          categories.map(cat => `<option value="${cat._id}">${cat.name}</option>`).join('');
      }
    } catch (error) {
      console.error('Kategoriler yüklenirken hata:', error);
    }
  };

  // Kampanya için ürünleri yükle
  const loadProductsForCampaign = async () => {
    try {
      const products = await fetch('/api/products').then(res => res.json());
      const campaignProductsList = document.getElementById('campaignProductsList');
      
      if (campaignProductsList) {
        campaignProductsList.innerHTML = products.map(product => `
          <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded">
            <input type="checkbox" value="${product._id}" class="rounded border-slate-300 text-[#CBA135] focus:ring-[#CBA135]">
            <span class="text-sm text-slate-700">${product.name}</span>
          </label>
        `).join('');
      }
    } catch (error) {
      console.error('Ürünler yüklenirken hata:', error);
    }
  };

  // Kampanya görsel yükleme sistemi
  const setupCampaignImageUpload = () => {
    const pickCampaignImageBtn = document.getElementById('pickCampaignImageBtn');
    const campaignImageInput = document.getElementById('campaignImageInput');
    const campaignImagePreview = document.getElementById('campaignImagePreview');
    const campaignDropZone = document.getElementById('campaignDropZone');
    
    if (pickCampaignImageBtn && campaignImageInput && campaignImagePreview) {
      // Görsel seç butonuna tıklama
      pickCampaignImageBtn.addEventListener('click', () => {
        campaignImageInput.click();
      });
      
      // Görsel seçildiğinde
      campaignImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          // Dosya tipi kontrolü
          if (!file.type.startsWith('image/')) {
            alert('Lütfen geçerli bir görsel dosyası seçin');
            return;
          }
          
          // Dosya boyutu kontrolü (5MB)
          if (file.size > 5 * 1024 * 1024) {
            alert('Görsel dosyası 5MB\'dan küçük olmalıdır');
            return;
          }
          
          // Önizleme göster
          const reader = new FileReader();
          reader.onload = (e) => {
            campaignImagePreview.src = e.target.result;
            campaignImagePreview.classList.remove('hidden');
            
            // Drop zone'u güncelle
            campaignDropZone.innerHTML = `
              <div class="text-center">
                <img src="${e.target.result}" alt="Kampanya Görseli" class="max-h-32 mx-auto rounded-lg mb-2">
                <p class="text-sm text-slate-500">${file.name}</p>
                <button type="button" id="removeCampaignImageBtn" class="text-red-600 underline text-sm mt-2">Görseli Kaldır</button>
              </div>
            `;
            
            // Görsel kaldır butonuna event listener ekle
            const removeBtn = document.getElementById('removeCampaignImageBtn');
            if (removeBtn) {
              removeBtn.addEventListener('click', () => {
                campaignImageInput.value = '';
                campaignImagePreview.classList.add('hidden');
                resetCampaignDropZone();
              });
            }
          };
          reader.readAsDataURL(file);
        }
      });
      
      // Drag & Drop desteği
      campaignDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        campaignDropZone.classList.add('border-[#CBA135]', 'bg-[#CBA135]/5');
      });
      
      campaignDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        campaignDropZone.classList.remove('border-[#CBA135]', 'bg-[#CBA135]/5');
      });
      
      campaignDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        campaignDropZone.classList.remove('border-[#CBA135]', 'bg-[#CBA135]/5');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          campaignImageInput.files = files;
          campaignImageInput.dispatchEvent(new Event('change'));
        }
      });
    }
  };
  
  // Kampanya drop zone'u sıfırla
  const resetCampaignDropZone = () => {
    const campaignDropZone = document.getElementById('campaignDropZone');
    if (campaignDropZone) {
      campaignDropZone.innerHTML = `
        <input id="campaignImageInput" name="image" type="file" accept="image/*" class="hidden" />
        <p class="text-sm text-slate-500"><button type="button" id="pickCampaignImageBtn" class="text-[#CBA135] underline">Görsel seçin</button> veya sürükleyip bırakın</p>
        <img id="campaignImagePreview" class="mt-3 max-h-32 mx-auto rounded-lg hidden" />
      `;
      
      // Yeni elementlere event listener'ları ekle
      setupCampaignImageUpload();
    }
  };
  
  // Kampanya sekmesi açıldığında setup'ı çalıştır
  const campaignsTab = document.getElementById('tab-campaigns-btn');
  if (campaignsTab) {
    campaignsTab.addEventListener('click', () => {
      // Sekme değiştiğinde kampanya setup'ını çalıştır
      setTimeout(setupCampaignsTab, 100);
    });
  }

  // Öne çıkarma işlevselliği
  const setupFeaturedTab = () => {
    loadFeaturedProducts();
    loadProductsForFeatured();
    setupFeaturedForm();
    setupFeaturedReorder();
  };

  // Öne çıkan ürünleri yükle
  const loadFeaturedProducts = async () => {
    try {
      const response = await fetch('/api/featured-products', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const featuredProducts = await response.json();
        displayFeaturedProducts(featuredProducts);
      } else {
        console.error('Öne çıkan ürünler yüklenemedi');
      }
    } catch (error) {
      console.error('Öne çıkan ürünler yüklenirken hata:', error);
    }
  };

  // Öne çıkan ürünleri görüntüle
  const displayFeaturedProducts = (featuredProducts) => {
    const featuredList = document.getElementById('featuredList');
    if (!featuredList) return;

    if (featuredProducts.length === 0) {
      featuredList.innerHTML = '<p class="text-slate-500 text-center py-8">Henüz öne çıkan ürün bulunmuyor</p>';
      return;
    }

    featuredList.innerHTML = featuredProducts.map((item, index) => `
      <div class="featured-item bg-slate-50 rounded-xl p-4 border border-slate-200" data-id="${item._id}" data-priority="${item.priority}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center text-slate-500 font-semibold">
              ${item.priority}
            </div>
            <div class="flex-1">
              <h4 class="font-medium text-slate-800">${item.productId.name}</h4>
              <p class="text-sm text-slate-500">${item.productId.categoryId?.name || 'Kategori yok'}</p>
              ${item.notes ? `<p class="text-xs text-slate-400 mt-1">${item.notes}</p>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button class="featured-delete px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50" data-id="${item._id}">
              Kaldır
            </button>
          </div>
        </div>
        ${item.endDate ? `<p class="text-xs text-slate-400 mt-2">Bitiş: ${new Date(item.endDate).toLocaleDateString('tr-TR')}</p>` : ''}
      </div>
    `).join('');

    // Event listener'ları ekle
    setupFeaturedItemEvents();
  };

  // Öne çıkan ürün event'lerini ayarla
  const setupFeaturedItemEvents = () => {
    // Sil butonları
    document.querySelectorAll('.featured-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        deleteFeaturedProduct(id);
      });
    });
  };



  // Öne çıkan ürün sil
  const deleteFeaturedProduct = async (id) => {
    if (!confirm('Bu ürünü öne çıkanlardan kaldırmak istediğinizden emin misiniz?')) {
      return;
    }

    try {
      const response = await fetch(`/api/featured-products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        loadFeaturedProducts();
        loadProductsForFeatured(); // Ürün listesini yenile
      } else {
        alert('Ürün kaldırılırken hata oluştu');
      }
    } catch (error) {
      console.error('Öne çıkan ürün silme hatası:', error);
    }
  };

  // Ürünleri öne çıkarma için yükle
  const loadProductsForFeatured = async () => {
    try {
      const response = await fetch('/api/products', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const products = await response.json();
        const select = document.getElementById('featuredProductSelect');
        
        // Mevcut seçenekleri temizle
        select.innerHTML = '<option value="">Ürün seçin...</option>';
        
        // Öne çıkan olmayan ürünleri ekle
        products.forEach(product => {
          if (!product.featured) {
            const option = document.createElement('option');
            option.value = product._id;
            option.textContent = `${product.name} (${product.categoryId?.name || 'Kategori yok'})`;
            select.appendChild(option);
          }
        });
      }
    } catch (error) {
      console.error('Ürünler yüklenirken hata:', error);
    }
  };

  // Öne çıkarma form'unu ayarla
  const setupFeaturedForm = () => {
    const form = document.getElementById('featuredForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const productId = document.getElementById('featuredProductSelect').value;
      const priority = parseInt(document.getElementById('featuredPriority').value);
      const endDate = document.getElementById('featuredEndDate').value;
      const notes = document.getElementById('featuredNotes').value;

      if (!productId) {
        alert('Lütfen bir ürün seçin');
        return;
      }

      try {
        const response = await fetch('/api/featured-products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productId,
            priority,
            endDate: endDate || null,
            notes
          })
        });

        if (response.ok) {
          // Form'u sıfırla
          form.reset();
          
          // Listeleri yenile
          loadFeaturedProducts();
          loadProductsForFeatured();
          
          alert('Ürün öne çıkarıldı');
        } else {
          const error = await response.json();
          alert(error.message || 'Bir hata oluştu');
        }
      } catch (error) {
        console.error('Öne çıkarma hatası:', error);
        alert('Bir hata oluştu');
      }
    });
  };

  // Öne çıkan ürünleri yeniden sırala
  const setupFeaturedReorder = () => {
    const reorderBtn = document.getElementById('reorderFeaturedBtn');
    if (!reorderBtn) return;

    reorderBtn.addEventListener('click', async () => {
      const items = document.querySelectorAll('.featured-item');
      const order = Array.from(items).map((item, index) => ({
        id: item.dataset.id,
        priority: index + 1
      }));

      try {
        const response = await fetch('/api/featured-products/reorder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ order })
        });

        if (response.ok) {
          alert('Sıralama kaydedildi');
          loadFeaturedProducts(); // Listeyi yenile
        } else {
          alert('Sıralama kaydedilemedi');
        }
      } catch (error) {
        console.error('Sıralama hatası:', error);
        alert('Sıralama kaydedilemedi');
      }
    });
  };

  // Öne çıkarma sekmesi açıldığında setup'ı çalıştır
  const featuredTab = document.getElementById('tab-featured-btn');
  if (featuredTab) {
    featuredTab.addEventListener('click', () => {
      setTimeout(setupFeaturedTab, 100);
    });
  }

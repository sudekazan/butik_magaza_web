const categoriesGrid = document.getElementById('categoriesGrid');
const productsGrid = document.getElementById('productsGrid');
const searchInput = document.getElementById('searchInput');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');

const backToCategoriesBtn = document.getElementById('backToCategoriesBtn');
const productsTitle = document.getElementById('productsTitle');
const selectedCategoryName = document.getElementById('selectedCategoryName');

let selectedCategoryId = null;
let selectedCategoryTitle = null;
let searchQuery = '';
let isShowingAllProducts = true;
let isShowingCampaignProducts = false;
let allProducts = [];
let campaignProducts = [];
let featuredProducts = [];

const fetchJSON = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errorText}`);
    }
    return res.json();
  } catch (error) {
    console.error('API isteği başarısız:', error);
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Sunucuya bağlanılamıyor. Lütfen internet bağlantınızı kontrol edin.');
    }
    throw new Error('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
  }
};

// Görsel URL'ini doğrula ve fallback ekle
const validateImageUrl = (imageUrl, base64ImageUrl = null) => {
  // Öncelik: Base64 görsel varsa onu kullan (yeni sistem)
  if (base64ImageUrl && base64ImageUrl.startsWith('data:image/')) {
    return base64ImageUrl;
  }
  
  // İkinci öncelik: Normal imageUrl
  if (!imageUrl) return 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
  
  // Eğer imageUrl geçerliyse kullan
  if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('http')) {
    // Uploads klasöründeki dosyalar için varlık kontrolü yap
    if (imageUrl.startsWith('/uploads/')) {
      const filename = imageUrl.replace('/uploads/', '');
      checkImageExists(filename, imageUrl);
    }
    return imageUrl;
  }
  
  // Geçersizse fallback döndür
  return 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
};

// Görsel yükleme için gelişmiş fonksiyon
const loadImageWithAdvancedHandling = async (imgElement, imageUrl, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    timeout = 10000,
    fallbackUrl = 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop'
  } = options;

  let retryCount = 0;
  
  const tryLoad = async () => {
    try {
      // Timeout ile fetch kullan
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(imageUrl, {
        method: 'GET',
        signal: controller.abortSignal,
        headers: {
          'Accept': 'image/*'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Content-Type kontrolü
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        console.warn(`⚠️ Yanlış Content-Type: ${contentType} for ${imageUrl}`);
        throw new Error(`Yanlış MIME tipi: ${contentType}`);
      }
      
      // Blob olarak al ve URL oluştur
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      // Görsel yüklendi
      imgElement.src = objectUrl;
      imgElement.onload = () => {
        URL.revokeObjectURL(objectUrl); // Memory leak'i önle
        if (imgElement.previousElementSibling) {
          imgElement.previousElementSibling.style.display = 'none';
        }
      };
      
      return true;
      
    } catch (error) {
      console.warn(`❌ Görsel yükleme hatası (${retryCount + 1}/${maxRetries}):`, error.message);
      
      if (retryCount < maxRetries - 1) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
        return false; // Tekrar dene
      } else {
        // Tüm denemeler başarısız, fallback kullan
        console.error('❌ Görsel yüklenemedi, fallback kullanılıyor:', imageUrl);
        imgElement.src = fallbackUrl;
        if (imgElement.previousElementSibling) {
          imgElement.previousElementSibling.style.display = 'none';
        }
        reportImageError(imageUrl);
        return true;
      }
    }
  };
  
  // İlk denemeyi başlat
  while (!(await tryLoad())) {
    // Retry loop
  }
};

// Görsel dosyasının varlığını kontrol et
const checkImageExists = async (filename, imageUrl) => {
  try {
    const response = await fetch(`/api/uploads/check/${encodeURIComponent(filename)}`);
    const data = await response.json();
    
    if (!data.exists) {
      console.warn(`⚠️ Görsel dosyası bulunamadı: ${filename}`);
      console.log('🔍 Aranan yollar:', data.searchedPaths);
      console.log('📁 Mevcut dizinler:', { currentDir: data.currentDir, cwd: data.cwd });
      
      // Hata raporunu sadece bir kez gönder
      if (!window.reportedImages) window.reportedImages = new Set();
      if (!window.reportedImages.has(imageUrl)) {
        window.reportedImages.add(imageUrl);
        reportImageError(imageUrl);
      }
    }
  } catch (error) {
    console.error('❌ Görsel varlık kontrolü hatası:', error);
  }
};

// Görsel yükleme hatası için retry mekanizması
const loadImageWithRetry = (imgElement, imageUrl, maxRetries = 2) => {
  let retryCount = 0;
  
  const tryLoad = () => {
    imgElement.src = imageUrl;
  };
  
  imgElement.onerror = () => {
    if (retryCount < maxRetries) {
      retryCount++;
      console.log(`🔄 Görsel yükleme hatası, ${retryCount}. deneme:`, imageUrl);
      setTimeout(tryLoad, 1000 * retryCount); // Her denemede daha uzun bekle
    } else {
      console.log('❌ Görsel yüklenemedi, fallback kullanılıyor:', imageUrl);
      imgElement.src = 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
      
      // Hata raporunu sunucuya gönder
      reportImageError(imageUrl);
    }
  };
  
  tryLoad();
};

// Görsel yükleme hatalarını raporla
const reportImageError = async (imageUrl) => {
  try {
    await fetch('/api/uploads/report-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageUrl,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        page: window.location.href
      })
    });
  } catch (error) {
    console.error('❌ Hata raporu gönderilemedi:', error);
  }
};

// Görsel hata yönetimi fonksiyonu
const handleImageError = (imgElement, originalSrc) => {
  // Eğer bu görsel zaten hata verdi ise tekrar rapor etme
  if (imgElement.dataset.errorReported === 'true') {
    return;
  }
  
  console.log('❌ Görsel yükleme hatası:', originalSrc);
  
  // Loading state'i gizle
  const loadingElement = imgElement.previousElementSibling;
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
  
  // Gelişmiş görsel yükleme dene
  if (originalSrc && originalSrc.startsWith('/uploads/')) {
    loadImageWithAdvancedHandling(imgElement, originalSrc, {
      maxRetries: 2,
      retryDelay: 500
    });
  } else {
    // Fallback görsel kullan
    imgElement.src = 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
  }
  
  // Hata raporunu sadece bir kez gönder
  imgElement.dataset.errorReported = 'true';
  reportImageError(originalSrc);
  
  // Görsel hata logunu konsola yaz
  console.warn(`Görsel yüklenemedi: ${originalSrc}, gelişmiş yükleme deneniyor`);
};

// Uploads klasörü durumunu kontrol et
const checkUploadsHealth = async () => {
  try {
    const response = await fetch('/api/uploads/health');
    const data = await response.json();
    
    if (data.status === 'healthy') {
      console.log('✅ Uploads klasörü sağlıklı:', data.fileCount, 'dosya');
    } else {
      console.warn('⚠️ Uploads klasörü sorunlu:', data.message);
    }
  } catch (error) {
    console.error('❌ Uploads health check başarısız:', error);
  }
};

// Görsel performans izleme
const monitorImagePerformance = () => {
  const images = document.querySelectorAll('img');
  let loadedCount = 0;
  let errorCount = 0;
  let totalSize = 0;
  
  images.forEach(img => {
    if (img.complete) {
      loadedCount++;
      if (img.naturalWidth > 0) {
        totalSize += img.naturalWidth * img.naturalHeight;
      }
    } else {
      img.addEventListener('load', () => {
        loadedCount++;
        if (img.naturalWidth > 0) {
          totalSize += img.naturalWidth * img.naturalHeight;
        }
      });
      
      img.addEventListener('error', () => {
        errorCount++;
        console.warn('❌ Görsel yükleme hatası:', img.src);
      });
    }
  });
  
  // Performans bilgilerini logla
  setTimeout(() => {
    console.log('📊 Görsel Performans Raporu:', {
      toplamGorsel: images.length,
      yuklenen: loadedCount,
      hatali: errorCount,
      basariliOran: `${((loadedCount / images.length) * 100).toFixed(1)}%`,
      toplamPiksel: totalSize.toLocaleString()
    });
  }, 2000);
};

// Sayfa yüklendiğinde performans izlemeyi başlat
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(monitorImagePerformance, 1000);
});



const createCategoryCard = (category) => {
  // Görsel URL'ini doğrula
  const img = validateImageUrl(category.imageUrl);
  
  return `
    <a href="/category?id=${category._id}" class="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-500 text-left category-card bg-white/95 backdrop-blur-sm border border-white/40 hover:border-accent-200/60 block hover:scale-105 transform" data-category-id="${category._id}">
      <div class="overflow-hidden relative aspect-[4/5]">
        <!-- Loading State -->
        <div class="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
          <div class="w-8 h-8 border-4 border-gray-300 border-t-accent-500 rounded-full animate-spin"></div>
        </div>
        
        <!-- Image with Error Handling -->
        <img 
          src="${img}" 
          alt="${category.name}" 
          class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 relative z-10"
          onload="this.previousElementSibling.style.display='none'"
          onerror="handleImageError(this, '${img}')"
          loading="lazy"
          decoding="async"
        />
        
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent z-20"></div>
        
        <!-- Category Icon -->
        <div class="absolute top-3 left-3 w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 z-30">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
        </div>
        
        <!-- Hover Effect -->
        <div class="absolute inset-0 bg-gradient-to-t from-accent-500/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-30"></div>
      </div>
      
      <div class="p-4 sm:p-5 text-center">
        <h3 class="text-lg sm:text-xl font-bold text-gray-800 mb-2 group-hover:text-accent-600 transition-colors duration-300">
          ${category.name}
        </h3>
        <p class="text-sm sm:text-base text-gray-600 mb-3 hidden sm:block">
          ${category.description || 'Özel tasarım koleksiyonu'}
        </p>
        
        <div class="flex items-center justify-center gap-2 text-accent-600 font-medium text-sm sm:text-base">
          <span>Ürünleri Keşfet</span>
          <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    </a>
  `;
};

const showError = (message, containerId) => {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16">
        <div class="inline-flex flex-col items-center gap-4 p-8 bg-red-50 border border-red-200 rounded-2xl">
          <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.800 2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
          </div>
          <div class="text-center">
            <h3 class="text-lg font-semibold text-red-800 mb-2">Bir Hata Oluştu</h3>
            <p class="text-red-600 mb-4">${message}</p>
            <button onclick="location.reload()" class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              Sayfayı Yenile
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    // Container bulunamadıysa console'a hata yaz
    console.error(`Container bulunamadı: ${containerId}`);
  }
};

// Ürün kartına tıklama işleyicisi
const handleProductClick = (productId, productName) => {
  try {
    console.log('🖱️ Ürün kartına tıklandı:', { productId, productName });
    
    if (!productId) {
      console.error('❌ Ürün ID bulunamadı');
      alert('Ürün bilgisi bulunamadı. Lütfen tekrar deneyin.');
      return;
    }
    
    // Ürün detay sayfasına yönlendir - query parameter ile ürün bilgilerini aktar
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.split('?')[0];
    const newUrl = `/product/${productId}`;
    
    console.log('🔗 Yönlendiriliyor:', newUrl);
    window.location.href = newUrl;
  } catch (error) {
    console.error('❌ Ürün tıklama hatası:', error);
    alert('Bir hata oluştu. Lütfen tekrar deneyin.');
  }
};

const createProductCard = (product, isPanel = false) => {
  const cardClass = isPanel 
    ? 'group relative bg-white/98 backdrop-blur-sm rounded-2xl overflow-hidden soft-shadow hover:soft-shadow-lg transition-all duration-500 product-card border border-white/40 hover:border-accent-200/60 cursor-pointer flex flex-col hover:scale-105 active:scale-95'
    : 'group relative bg-white/98 backdrop-blur-sm rounded-3xl overflow-hidden soft-shadow hover:soft-shadow-lg transition-all duration-500 product-card border border-white/40 hover:border-accent-200/60 cursor-pointer h-full flex flex-col hover:scale-105 active:scale-95';
  
  // Görsel URL'ini doğrula
  const img = validateImageUrl(product.imageUrl, product.base64ImageUrl);
  
  // Kampanya indirim bilgilerini hesapla
  let campaignDiscount = 0;
  let discountedPrice = product.price;
  let originalPrice = product.price;
  
  // Aktif kampanyalardan bu ürün için en yüksek indirimi bul
  if (window.activeCampaigns && Array.isArray(window.activeCampaigns)) {
    window.activeCampaigns.forEach(campaign => {
      if (campaign.isActive && campaign.discount > 0) {
        // Ürün bazlı kampanya kontrolü
        if (campaign.type === 'products' && campaign.productIds && campaign.productIds.some(p => p._id === product._id)) {
          if (campaign.discount > campaignDiscount) {
            campaignDiscount = campaign.discount;
          }
        }
        // Kategori bazlı kampanya kontrolü
        else if (campaign.type === 'category' && campaign.targetId && product.categoryId && product.categoryId._id === campaign.targetId._id) {
          if (campaign.discount > campaignDiscount) {
            campaignDiscount = campaign.discount;
          }
        }
      }
    });
  }
  
  // İndirimli fiyatı hesapla
  if (campaignDiscount > 0) {
    discountedPrice = Math.round(product.price * (1 - campaignDiscount / 100));
    originalPrice = product.price;
  }
  
  // Beden bazlı stok bilgisi - Mobilde daha kompakt
  let stockInfo = '';
  if (product.sizeStocks && Array.isArray(product.sizeStocks)) {
    stockInfo = product.sizeStocks.map(stock => 
      `<span class="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 md:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${
        stock.stock > 0 ? 'bg-pastel-sage text-gray-700 border border-gray-200' : 'bg-pastel-peach text-gray-600 border border-gray-200'
      }">
        ${stock.size}: ${stock.stock > 0 ? stock.stock : 'Yok'}
      </span>`
    ).join('');
  } else {
    // Eski stok sistemi için geriye uyumluluk
    const stockText = product.stock > 0 ? `Stok: ${product.stock}` : 'Stokta yok';
    const stockClass = product.stock > 0 ? 'bg-pastel-sage text-gray-700 border border-gray-200' : 'bg-pastel-peach text-gray-600 border border-gray-200';
    stockInfo = `<span class="inline-flex items-center px-1 sm:px-1.5 md:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${stockClass}">${stockText}</span>`;
  }

  // Renk varyantları - Mobilde daha kompakt
  let colorVariantsHtml = '';
  if (product.colorVariants && Array.isArray(product.colorVariants) && product.colorVariants.length > 0) {
    colorVariantsHtml = `
      <div class="flex items-center gap-1 sm:gap-2">
        <span class="text-xs sm:text-sm text-gray-500">Renkler:</span>
        <div class="flex flex-wrap gap-0.5 sm:gap-1 md:gap-2">
          ${product.colorVariants.slice(0, 3).map(variant => 
            `<span class="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 rounded-full border-2 border-white shadow-sm" style="background-color: ${variant.colorHex || '#ccc'}"></span>`
          ).join('')}
          ${product.colorVariants.length > 3 ? `<span class="text-xs text-gray-400">+${product.colorVariants.length - 3}</span>` : ''}
        </div>
      </div>
    `;
  }
  
  const isPanelView = isPanel;
  
  return `
    <div class="${cardClass}" onclick="handleProductClick('${product._id}', '${product.name || 'Ürün'}')">
      <div class="overflow-hidden relative ${isPanelView ? 'h-32' : ''}">
        <!-- Loading State -->
        <div class="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center z-10">
          <div class="w-8 h-8 border-4 border-gray-300 border-t-accent-500 rounded-full animate-spin"></div>
        </div>
        
        <!-- Image with Error Handling -->
        <img 
          src="${img}" 
          alt="${product.name}" 
          class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 relative z-20"
          onload="this.previousElementSibling.style.display='none'"
          onerror="handleImageError(this, '${img}')"
          loading="lazy"
          decoding="async"
        />
        
        <!-- Kampanya İndirim Badge'i -->
        ${campaignDiscount > 0 ? `
          <div class="absolute top-2 sm:top-3 md:top-4 left-2 sm:left-3 md:left-4 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-red-500 text-white font-bold text-xs sm:text-sm shadow-lg">
            %${campaignDiscount} İndirim
          </div>
        ` : ''}
        
        <!-- Price Badge - Mobilde daha kompakt -->
        <div class="absolute top-2 sm:top-3 md:top-4 right-2 sm:right-3 md:right-4 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 rounded-xl sm:rounded-2xl bg-white/95 backdrop-blur-sm border border-white/50 soft-shadow">
          ${campaignDiscount > 0 ? `
            <!-- İndirimli fiyat -->
            <div class="text-xs sm:text-sm md:text-lg font-bold text-red-600 mb-1">
              ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(discountedPrice)}
            </div>
            <!-- Orijinal fiyat (üstü çizili) -->
            <div class="text-xs sm:text-sm text-gray-500 line-through">
              ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(originalPrice)}
            </div>
          ` : `
            <!-- Normal fiyat -->
          <div class="text-xs sm:text-sm md:text-lg font-bold text-accent-600">
            ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(product.price)}
          </div>
          `}
        </div>
        
        <!-- Click to View Overlay - Mobilde gizle -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center hidden sm:flex">
          <div class="text-white text-center transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
            <div class="bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/30">
              <svg class="w-6 h-6 mx-auto mb-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <span class="text-sm font-medium">Detayları Gör</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="${isPanelView ? 'p-3' : 'p-3 sm:p-4 md:p-5 lg:p-6'} flex-1 flex flex-col">
        <div class="flex-1 space-y-2 sm:space-y-2.5 md:space-y-3">
          <h3 class="font-bold text-gray-800 text-sm sm:text-base md:text-lg lg:text-xl leading-tight group-hover:text-accent-600 transition-colors duration-300 ${isPanelView ? 'min-h-[2rem]' : 'min-h-[3rem] sm:min-h-[3.5rem] md:min-h-[4rem]'} flex items-start">
            ${product.name}
          </h3>
          
          <!-- Stock Info - Mobilde daha kompakt -->
          <div class="flex flex-wrap gap-1 sm:gap-2 items-start">
            ${stockInfo}
          </div>
          
          <!-- Color Variants - Mobilde daha kompakt -->
          ${colorVariantsHtml}
          
          <!-- Category Badge - Mobilde daha kompakt -->
          <div class="flex items-center gap-1 sm:gap-2">
            <span class="text-xs sm:text-sm text-gray-500">Kategori:</span>
            <span class="px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-pastel-cream text-gray-600 border border-gray-100">
              ${product.categoryId && product.categoryId.name ? product.categoryId.name : 'Genel'}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Floating Elements - Mobilde gizle -->
      <div class="absolute top-2 sm:top-4 left-2 sm:left-4 w-1 h-1 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 bg-accent-400 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 animate-pulse hidden sm:block"></div>
      <div class="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-3 md:h-3 bg-pastel-peach rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 hidden sm:block"></div>
      
      <!-- Click Indicator - Mobilde gizle -->
      <div class="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-200 hidden sm:block">
        <div class="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full bg-accent-500/20 backdrop-blur-sm border border-accent-300/50 flex items-center justify-center">
          <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-accent-600 animate-pulse" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    </div>
  `;
};

const renderCategories = (categories) => {
  categoriesGrid.innerHTML = '';
  categories.forEach((cat) => {
    const cardHTML = createCategoryCard(cat);
    const cardElement = document.createElement('div');
    cardElement.innerHTML = cardHTML;
    const card = cardElement.firstElementChild;
    card.classList.add('fade-in-section');
    categoriesGrid.appendChild(card);
  });
  
  // Trigger animation after a small delay
  setTimeout(() => {
    document.querySelectorAll('#categoriesGrid .fade-in-section').forEach((el, index) => {
      setTimeout(() => el.classList.add('visible'), index * 100);
    });
  }, 100);
};

const renderMobileCategories = (categories) => {
  const mobileCategoriesList = document.getElementById('mobileCategoriesList');
  if (!mobileCategoriesList) return;
  
  mobileCategoriesList.innerHTML = '';
  categories.forEach((cat) => {
    const categoryItem = document.createElement('div');
    categoryItem.className = 'p-4 rounded-xl bg-white/80 border border-gray-100 hover:border-accent-300 hover:bg-white/90 transition-all duration-300 cursor-pointer';
    categoryItem.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-pastel-cream to-pastel-blush rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          <div>
            <h4 class="font-semibold text-gray-800">${cat.name}</h4>
            <p class="text-sm text-gray-600">${cat.description || 'Özel tasarım koleksiyonu'}</p>
          </div>
        </div>
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </div>
    `;
    
    categoryItem.addEventListener('click', () => {
      selectMobileCategory(cat._id, cat.name);
    });
    
    mobileCategoriesList.appendChild(categoryItem);
  });
};

const renderMobileProducts = (products) => {
  const mobileProductsGrid = document.getElementById('mobileProductsGrid');
  if (!mobileProductsGrid) return;
  
  mobileProductsGrid.innerHTML = '';
  if (!products.length) {
    mobileProductsGrid.innerHTML = `
      <div class="col-span-2 text-center py-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
          <svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-600 mb-2">Ürün Bulunamadı</h3>
        <p class="text-slate-500 text-sm">Bu kategoride ürün bulunamadı.</p>
      </div>
    `;
    return;
  }
  
  products.forEach((p, index) => {
    const cardHTML = createProductCard(p, true); // Panel modunda oluştur
    
    // HTML string'i DOM elementine çevir
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHTML;
    const card = tempDiv.firstElementChild;
    
    if (card) {
      card.classList.add('fade-in-section');
      mobileProductsGrid.appendChild(card);
    }
  });
  
  // Trigger animation after a small delay
  setTimeout(() => {
    document.querySelectorAll('#mobileProductsGrid .fade-in-section').forEach((el, index) => {
      setTimeout(() => el.classList.add('visible'), index * 50);
    });
  }, 100);
};

const renderProducts = (products, isPanel = false) => {
  console.log('🎨 renderProducts çağrıldı:', { productsCount: products.length, isPanel });
  
  // Ana ürünler grid'ini bul - isPanel false ise ana sayfadaki productsGrid'i kullan
  const targetGrid = isPanel ? document.getElementById('panelProductsGrid') : document.getElementById('productsGrid');
  
  if (!targetGrid) {
    console.error('❌ Ürün grid bulunamadı! productsGrid ID\'li element yok!');
    return;
  }
  
  targetGrid.innerHTML = '';
  
  if (!products.length) {
    targetGrid.innerHTML = `
      <div class="col-span-full text-center py-16">
        <div class="inline-flex flex-col items-center gap-4 p-8 bg-gray-50 border border-gray-200 rounded-2xl">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
            </svg>
          </div>
          <div class="text-center">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">Ürün Bulunamadı</h3>
            <p class="text-gray-600 mb-4">Arama kriterlerinize uygun ürün bulunamadı.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  // Ürün kartlarını oluştur
  const productsHTML = products.map(product => createProductCard(product, isPanel)).join('');
  targetGrid.innerHTML = productsHTML;
  
  // Trigger animation after a small delay
  setTimeout(() => {
    const fadeElements = targetGrid.querySelectorAll('.fade-in-section');
    fadeElements.forEach((el, index) => {
      setTimeout(() => el.classList.add('visible'), index * 50);
    });
  }, 100);
  
  // Update products count if in panel
  if (isPanel) {
    const productsCount = document.getElementById('productsCount');
    if (productsCount) {
      productsCount.textContent = `${products.length} ürün`;
    }
  }
};

const fetchAndRenderCategories = async () => {
  try {
    const data = await fetchJSON('/api/categories');
    renderCategories(data);
  } catch (e) {
    console.error('Kategoriler yüklenirken hata:', e);
    showError(e.message, 'categoriesGrid');
  }
};

const loadMobileCategories = async () => {
  try {
    const data = await fetchJSON('/api/categories');
    renderMobileCategories(data);
  } catch (e) {
    console.error('Mobil kategoriler yüklenirken hata:', e);
    showError(e.message, 'mobileCategoriesList');
  }
};

const fetchAndRenderProducts = async (query = '', isPanel = false, categoryId = null) => {
  try {
    let url = '/api/products';
    const params = new URLSearchParams();
    
    if (query) params.set('q', query);
    
    // Eğer kategori ID verilmişse, o kategoriye göre filtrele
    if (categoryId) {
      params.set('categoryId', categoryId);
    } else if (selectedCategoryId) {
      // Seçili kategori varsa onu kullan
      params.set('categoryId', selectedCategoryId);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const data = await fetchJSON(url);
    
    if (data && Array.isArray(data)) {
      // Tüm ürünleri global değişkende sakla
      allProducts = data;
      
      // Kampanya ürünlerini de yükle
      await loadCampaignProducts();
      
      renderProducts(data, isPanel);
    } else {
      console.error('❌ API response geçersiz:', data);
    }
  } catch (e) {
    console.error('❌ Ürünler yüklenirken hata:', e);
    if (isPanel) {
      showError(e.message, 'panelProductsGrid');
    } else {
      showError(e.message, 'productsGrid');
    }
  }
};

const fetchAndRenderMobileProducts = async () => {
  try {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set('categoryId', selectedCategoryId);
    
    const url = `/api/products?${params.toString()}`;
    const data = await fetchJSON(url);
    renderMobileProducts(data);
  } catch (e) {
    console.error('Mobil ürünler yüklenirken hata:', e);
    showError(e.message, 'mobileProductsGrid');
  }
};

const selectCategory = (id, title) => {
  selectedCategoryId = id;
  selectedCategoryTitle = title;
  isShowingAllProducts = false;
  
  // Kategori secimini gorsel olarak isaretle
  document.querySelectorAll('.category-selected').forEach((e) => e.classList.remove('category-selected'));
  document.querySelector(`[data-category-id="${id}"]`)?.classList.add('ring-4', 'ring-accent-400', 'category-selected');
  
  // UI'yi guncelle
  productsTitle.innerHTML = `<span class="gradient-text">${title}</span> Ürünleri`;
  selectedCategoryName.textContent = title;
  selectedCategoryName.classList.remove('hidden');
  backToCategoriesBtn.classList.remove('hidden');
  
  // Mobil ürünler bölümünü gizle (masaüstünde kategori seçildiğinde)
  const mobileProductsSection = document.getElementById('mobileProductsSection');
  if (mobileProductsSection) {
    mobileProductsSection.classList.add('hidden');
  }
  
  // Mobil geri dön butonunu gizle
  const backToCategoriesBtnMobile = document.getElementById('backToCategoriesBtnMobile');
  if (backToCategoriesBtnMobile) {
    backToCategoriesBtnMobile.classList.add('hidden');
  }
  
  // Urunleri yukle
  fetchAndRenderProducts();
};

const selectMobileCategory = (id, title) => {
  // Mobil kategoriler panelini kapat
  const mobileCategoriesPanel = document.getElementById('mobileCategoriesPanel');
  if (mobileCategoriesPanel) {
    mobileCategoriesPanel.classList.add('hidden');
    document.body.style.overflow = '';
  }
  
  // Kategori sayfasına yönlendir
  window.location.href = `/category?id=${id}`;
};

const showAllProducts = () => {
  selectedCategoryId = null;
  selectedCategoryTitle = null;
  searchQuery = ''; // Aramayi da temizle
  isShowingAllProducts = true;
  
  // Search input'larini temizle
  if (searchInput) searchInput.value = '';
  if (mobileSearchInput) mobileSearchInput.value = '';
  
  // Kategori secimini temizle
  document.querySelectorAll('.category-selected').forEach((e) => e.classList.remove('category-selected'));
  
  // UI'yi guncelle
  if (productsTitle) {
    productsTitle.innerHTML = 'Tüm <span class="gradient-text">Ürünler</span>';
  }
  
  if (selectedCategoryName) {
    selectedCategoryName.classList.add('hidden');
  }
  
  if (backToCategoriesBtn) {
    backToCategoriesBtn.classList.add('hidden');
  }
  
  // Mobil ürünler bölümünü gizle
  const mobileProductsSection = document.getElementById('mobileProductsSection');
  if (mobileProductsSection) {
    mobileProductsSection.classList.add('hidden');
  }
  
  // Mobil geri dön butonunu gizle
  const backToCategoriesBtnMobile = document.getElementById('backToCategoriesBtnMobile');
  if (backToCategoriesBtnMobile) {
    backToCategoriesBtnMobile.classList.add('hidden');
  }
  
  // Tum urunleri yukle (kategori filtresi olmadan)
  fetchAndRenderProducts('', false, null);
};

const backToCategories = () => {
  showAllProducts();
  
  // Mobil ürünler bölümünü gizle
  const mobileProductsSection = document.getElementById('mobileProductsSection');
  if (mobileProductsSection) {
    mobileProductsSection.classList.add('hidden');
  }
  
  // Mobil geri dön butonunu gizle
  const backToCategoriesBtnMobile = document.getElementById('backToCategoriesBtnMobile');
  if (backToCategoriesBtnMobile) {
    backToCategoriesBtnMobile.classList.add('hidden');
  }
  
  document.getElementById('categories').scrollIntoView({ behavior: 'smooth' });
};

// Search functionality
const handleSearch = (query) => {
  searchQuery = query.trim();
  
  // Arama sonuçları bölümünü göster/gizle
  const searchResultsSection = document.getElementById('searchResults');
  const productsSection = document.getElementById('products');
  
  if (searchQuery) {
    // Arama yapıldığında arama sonuçları bölümünü göster
    searchResultsSection?.classList.remove('hidden');
    productsSection?.classList.add('hidden');
    
    // Arama başlığını güncelle
    const searchResultsTitle = document.getElementById('searchResultsTitle');
    if (searchResultsTitle) {
      searchResultsTitle.innerHTML = `<span class="gradient-text">"${searchQuery}"</span> için sonuçlar`;
    }
    
    // Arama sonuçlarını yükle
    fetchAndRenderSearchResults(searchQuery);
  } else {
    // Arama temizlendiğinde normal ürünler bölümünü göster
    searchResultsSection?.classList.add('hidden');
    productsSection?.classList.remove('hidden');
    
    // Ürün başlığını güncelle
    if (productsTitle) {
      if (selectedCategoryTitle) {
        productsTitle.innerHTML = `<span class="gradient-text">${selectedCategoryTitle}</span> Ürünleri`;
      } else {
        productsTitle.innerHTML = 'Tüm <span class="gradient-text">Ürünler</span>';
      }
    }
    
    // Tüm ürünleri yükle
    fetchAndRenderProducts();
  }
  
  // Mobil ürünler bölümünü gizle (arama yapıldığında)
  const mobileProductsSection = document.getElementById('mobileProductsSection');
  if (mobileProductsSection) {
    mobileProductsSection.classList.add('hidden');
  }
  
  // Mobil geri dön butonunu gizle
  const backToCategoriesBtnMobile = document.getElementById('backToCategoriesBtnMobile');
  if (backToCategoriesBtnMobile) {
    backToCategoriesBtnMobile.classList.add('hidden');
  }

  // Arama yaparken sonuclar gorunecek sekilde asagi kaydir
  if (searchQuery) {
    const searchResultsSection = document.getElementById('searchResults');
    searchResultsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

let searchDebounce;

searchInput?.addEventListener('input', (e) => {
  window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(() => {
    handleSearch(e.target.value);
  }, 300);
});

mobileSearchInput?.addEventListener('input', (e) => {
  window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(() => {
    handleSearch(e.target.value);
  }, 300);
});

// Enter ile aramayi tetikle ve sonuclara kaydir
searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSearch(e.target.value);
  }
});

mobileSearchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSearch(e.target.value);
  }
});

// Event listeners
backToCategoriesBtn?.addEventListener('click', backToCategories);

// Clear search button
const clearSearchBtn = document.getElementById('clearSearchBtn');
clearSearchBtn?.addEventListener('click', () => {
  // Search input'larını temizle
  if (searchInput) searchInput.value = '';
  if (mobileSearchInput) mobileSearchInput.value = '';
  
  // Arama sorgusunu temizle
  searchQuery = '';
  
  // Arama sonuçları bölümünü gizle
  const searchResultsSection = document.getElementById('searchResults');
  searchResultsSection?.classList.add('hidden');
  
  // Normal ürünler bölümünü göster
  const productsSection = document.getElementById('products');
  productsSection?.classList.remove('hidden');
  
  // Ürün başlığını güncelle
  if (productsTitle) {
    if (selectedCategoryTitle) {
      productsTitle.innerHTML = `<span class="gradient-text">${selectedCategoryTitle}</span> Ürünleri`;
    } else {
      productsTitle.innerHTML = 'Tüm <span class="gradient-text">Ürünler</span>';
    }
  }
  
  // Tüm ürünleri yükle
  fetchAndRenderProducts();
  
  // Ürünler bölümüne scroll yap
  productsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

mobileMenuBtn?.addEventListener('click', () => {
  mobileMenu.classList.toggle('hidden');
});

// Close mobile menu button
const closeMobileMenu = document.getElementById('closeMobileMenu');
closeMobileMenu?.addEventListener('click', () => {
  mobileMenu.classList.add('hidden');
});

// Tüm panelleri dışarı tıklayarak kapat
document.addEventListener('click', (e) => {
  // Mobil menüyü kapat
  if (!mobileMenuBtn?.contains(e.target) && !mobileMenu?.contains(e.target)) {
    mobileMenu?.classList.add('hidden');
  }
  
  // Mobil kategoriler panelini kapat
  const mobileCategoriesPanel = document.getElementById('mobileCategoriesPanel');
  if (mobileCategoriesPanel && !mobileCategoriesPanel.classList.contains('hidden')) {
    if (!mobileCategoriesBtn?.contains(e.target) && !mobileCategoriesPanel?.contains(e.target)) {
      mobileCategoriesPanel.classList.add('hidden');
    }
  }
  
  // Ürünler panelini kapat
  if (productsPanel && !productsPanel.classList.contains('translate-x-full')) {
    if (!productsPanel.contains(e.target) && !e.target.closest('#viewAllProductsBtn')) {
      productsPanel.classList.add('translate-x-full');
      
      // Panel kapatıldığında arama input'unu temizle
      const panelSearchInput = document.getElementById('panelSearchInput');
      if (panelSearchInput) {
        panelSearchInput.value = '';
      }
      
      // Panel kapatıldığında scroll pozisyonunu sıfırla
      setTimeout(() => {
        const panelScrollContainer = productsPanel.querySelector('.overflow-y-auto');
        if (panelScrollContainer) {
          panelScrollContainer.scrollTop = 0;
        }
      }, 300);
    }
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Başlangıç durumunu ayarla
  // Ana sayfada ürün gösterimi kaldırıldı
  
  // Uploads klasörü durumunu kontrol et
  checkUploadsHealth();
  
  // Kategorileri ve ürünleri yükle
  await Promise.all([
    fetchAndRenderCategories(),
    loadFeaturedProducts()
  ]);
  
  // Masaüstü kategoriler menüsünü yükle
  await loadDesktopCategories();
  
  // Add loading states
  const loadingStates = document.querySelectorAll('.fade-in-section');
  loadingStates.forEach((el, index) => {
    setTimeout(() => el.classList.add('visible'), index * 100);
  });
  
  // Scroll animasyonları kaldırıldı
});

// Add keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    mobileMenu?.classList.add('hidden');
    // Mobil kategoriler panelini de kapat
    const mobileCategoriesPanel = document.getElementById('mobileCategoriesPanel');
    if (mobileCategoriesPanel) {
      mobileCategoriesPanel.classList.add('hidden');
    }
  }
});

// Add smooth scroll behavior for all internal links
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (link) {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }
});

// Products Panel Event Listeners
const closeProductsPanel = document.getElementById('closeProductsPanel');
const productsPanel = document.getElementById('productsPanel');
const panelSearchInput = document.getElementById('panelSearchInput');

closeProductsPanel?.addEventListener('click', () => {
  productsPanel?.classList.add('translate-x-full');
  
  // Panel kapatıldığında arama input'unu temizle
  const panelSearchInput = document.getElementById('panelSearchInput');
  if (panelSearchInput) {
    panelSearchInput.value = '';
  }
  
  // Panel kapatıldığında scroll pozisyonunu sıfırla
  setTimeout(() => {
    const panelScrollContainer = productsPanel?.querySelector('.overflow-y-auto');
    if (panelScrollContainer) {
      panelScrollContainer.scrollTop = 0;
    }
  }, 300); // Panel kapanma animasyonundan sonra
});

// Panel arama
panelSearchInput?.addEventListener('input', (e) => {
  const query = e.target.value;
  if (query.trim()) {
    // Arama yapıldığında panel ürünlerini filtrele
    fetchAndRenderPanelProducts(query);
  } else {
    // Arama temizlendiğinde tüm ürünleri göster
    fetchAndRenderPanelProducts('');
  }
});



// Panel ürünlerini yükle ve göster
const fetchAndRenderPanelProducts = async (query) => {
  try {
    // Loading state'i göster
    const panelGrid = document.getElementById('panelProductsGrid');
    if (panelGrid) {
      panelGrid.innerHTML = `
        <div class="text-center py-12">
          <div class="inline-flex items-center gap-3">
            <div class="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-gray-600 text-sm">Ürünler yükleniyor...</span>
          </div>
        </div>
      `;
    }
    
    let url = '/api/products';
    if (query.trim()) {
      url += `?q=${encodeURIComponent(query.trim())}`;
    }
    
    const data = await fetchJSON(url);
    renderPanelProducts(data, query);
  } catch (error) {
    console.error('Panel ürünleri yüklenirken hata:', error);
    renderPanelProducts([], query);
  }
};

// Panel ürünlerini render et
const renderPanelProducts = (products, query) => {
  const panelGrid = document.getElementById('panelProductsGrid');
  const productsCount = document.getElementById('productsCount');
  
  if (!panelGrid) return;
  
  // Ürün sayısını güncelle
  if (productsCount) {
    productsCount.textContent = `${products.length} ürün`;
  }
  
  if (products.length === 0) {
    if (query.trim()) {
      panelGrid.innerHTML = `
        <div class="text-center py-12">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-800 mb-2">Sonuç Bulunamadı</h3>
          <p class="text-gray-600 text-sm">"${query}" için arama kriterlerinize uygun ürün bulunamadı.</p>
        </div>
      `;
    } else {
      panelGrid.innerHTML = `
        <div class="text-center py-12">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-800 mb-2">Henüz Ürün Yok</h3>
          <p class="text-gray-600 text-sm">Henüz ürün eklenmemiş.</p>
        </div>
      `;
    }
    return;
  }
  
  // Panel için özel ürün kartları oluştur
  const productsHTML = products.map(product => createPanelProductCard(product)).join('');
  panelGrid.innerHTML = productsHTML;
};

// Panel için özel ürün kartı oluştur
const createPanelProductCard = (product) => {
  const img = product.imageUrl || 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
  
  return `
    <div class="group bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden border border-gray-100 hover:border-accent-200 cursor-pointer panel-product-card" onclick="handleProductClick('${product._id}', '${product.name}')">
      <!-- Product Image -->
      <div class="relative overflow-hidden">
        <img src="${img}" alt="${product.name}" class="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300"/>
        <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        
        <!-- Price Badge -->
        <div class="absolute top-2 right-2 bg-accent-500 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-sm">
          ₺${product.price}
        </div>
      </div>
      
      <!-- Product Info -->
      <div class="p-3 space-y-2">
        <h3 class="font-medium text-gray-800 group-hover:text-accent-600 transition-colors duration-300 text-sm line-clamp-2 leading-tight min-h-[2.5rem] flex items-start">
          ${product.name}
        </h3>
        
        <!-- Category and Stock -->
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 truncate max-w-[60%]">${product.categoryId?.name || 'Kategori'}</span>
          <span class="text-accent-600 font-medium">Stok: ${product.stock || 0}</span>
        </div>
        
        <!-- View Button -->
        <button class="w-full py-2 bg-accent-500 hover:bg-accent-600 text-white font-medium rounded-lg transition-colors duration-300 text-xs transform hover:-translate-y-0.5">
          İncele
        </button>
      </div>
    </div>
  `;
};

// Mobile Categories Panel Event Listeners
const mobileCategoriesBtn = document.getElementById('mobileCategoriesBtn');
const mobileCategoriesPanel = document.getElementById('mobileCategoriesPanel');
const closeMobileCategoriesPanel = document.getElementById('closeMobileCategoriesPanel');
const mobileCategoriesList = document.getElementById('mobileCategoriesList');
const mobileProductsSection = document.getElementById('mobileProductsSection');
const mobileProductsGrid = document.getElementById('mobileProductsGrid');
const mobileProductsTitle = document.getElementById('mobileProductsTitle');
const backToCategoriesBtnMobile = document.getElementById('backToCategoriesBtnMobile');

mobileCategoriesBtn?.addEventListener('click', () => {
  const dropdown = document.getElementById('mobileCategoriesDropdown');
  const arrow = document.getElementById('categoriesArrow');
  
  // Dropdown'ı aç/kapat
  if (dropdown?.classList.contains('hidden')) {
    dropdown.classList.remove('hidden');
    arrow?.classList.add('rotate-180');
    // Kategorileri yükle
    loadMobileCategoriesDropdown();
  } else {
    dropdown?.classList.add('hidden');
    arrow?.classList.remove('rotate-180');
  }
});

closeMobileCategoriesPanel?.addEventListener('click', () => {
  mobileCategoriesPanel?.classList.add('hidden');
});



// ESC tuşu ile paneli kapat
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    mobileMenu?.classList.add('hidden');
    mobileCategoriesPanel?.classList.add('hidden');
  }
});

// Dropdown kategorileri yükle
const loadMobileCategoriesDropdown = async () => {
  try {
    const categories = await fetchJSON('/api/categories');
    renderMobileCategoriesDropdown(categories);
  } catch (error) {
    console.error('Dropdown kategoriler yüklenirken hata:', error);
    const dropdown = document.getElementById('mobileCategoriesDropdown');
    if (dropdown) {
      dropdown.innerHTML = `
        <div class="text-center py-4">
          <p class="text-gray-600 text-sm">Kategoriler yüklenirken bir hata oluştu.</p>
        </div>
      `;
    }
  }
};

// Dropdown kategorileri render et
const renderMobileCategoriesDropdown = (categories) => {
  const dropdown = document.getElementById('mobileCategoriesDropdown');
  if (!dropdown) return;
  
  dropdown.innerHTML = categories.map(category => `
    <button 
      class="w-full text-left py-3 px-4 rounded-lg text-gray-600 hover:bg-accent-50 hover:text-accent-600 transition-all duration-300 text-base flex items-center gap-3"
      data-category-id="${category._id}"
    >
      <div class="w-6 h-6 bg-accent-100 rounded-md flex items-center justify-center">
        <svg class="w-3 h-3 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
        </svg>
      </div>
      <span>${category.name}</span>
    </button>
  `).join('');
  
  // Kategori seçim event listener'larını ekle
  dropdown.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const categoryId = btn.getAttribute('data-category-id');
      const categoryName = btn.querySelector('span').textContent;
      selectMobileCategory(categoryId, categoryName);
      
      // Hamburger menüyü kapat
      mobileMenu?.classList.add('hidden');
      // Dropdown'ı kapat
      dropdown.classList.add('hidden');
      document.getElementById('categoriesArrow')?.classList.remove('rotate-180');
    });
  });
};

// Mobil kategorilerden kategori seçimi fonksiyonu zaten tanımlı

// Featured Products Functions
const fetchAndRenderFeaturedProducts = async () => {
  try {
    console.log('🎯 Featured products yükleniyor...');
    
    // Loading state'i göster
    const loadingState = document.getElementById('featuredLoadingState');
    const grid = document.getElementById('featuredProductsGrid');
    
    console.log('🔍 Loading state element:', loadingState);
    console.log('🔍 Grid element:', grid);
    
    if (loadingState) {
      loadingState.classList.remove('hidden');
      console.log('✅ Loading state gösterildi');
    }
    if (grid) {
      grid.classList.add('hidden');
      console.log('✅ Grid gizlendi');
    }
    
    // Öne çıkan ürünleri al
    console.log('🌐 Featured products API çağrısı yapılıyor...');
    console.log('📡 API URL: /api/products/featured');
    
    const featuredProducts = await fetchJSON('/api/products/featured');
    console.log('📦 Featured products API response:', featuredProducts);
    console.log('📊 Featured products array length:', featuredProducts?.length);
    
    // Eğer öne çıkan ürün yoksa, son eklenen 4 ürünü göster
    if (!featuredProducts || featuredProducts.length === 0) {
      console.log('⚠️ Öne çıkan ürün yok, son eklenen 4 ürün gösteriliyor...');
      const allProducts = await fetchJSON('/api/products');
      const fallbackProducts = allProducts.slice(0, 4);
      console.log('🔄 Fallback products (son 4):', fallbackProducts);
      
      // Loading state'i gizle ve ürünleri göster
      if (loadingState) {
        loadingState.classList.add('hidden');
        console.log('✅ Loading state gizlendi');
      }
      if (grid) {
        grid.classList.remove('hidden');
        console.log('✅ Grid gösterildi');
        renderFeaturedProducts(fallbackProducts);
      }
      return;
    }
    
    console.log('🎉 Featured products bulundu:', featuredProducts);
    
    // Loading state'i gizle ve ürünleri göster
    if (loadingState) {
      loadingState.classList.add('hidden');
      console.log('✅ Loading state gizlendi');
    }
    if (grid) {
      grid.classList.remove('hidden');
      console.log('✅ Grid gösterildi');
      renderFeaturedProducts(featuredProducts);
    }
    
    // Debug için console'a yazdır
    console.log('🎯 Featured products loaded:', featuredProducts);
    
  } catch (error) {
    console.error('❌ Featured products yüklenirken hata:', error);
    console.error('🔍 Hata detayı:', error.message);
    console.error('🔍 Hata stack:', error.stack);
    
    // Loading state'i gizle
    if (loadingState) loadingState.classList.add('hidden');
    
    const grid = document.getElementById('featuredProductsGrid');
    if (grid) {
      grid.classList.remove('hidden');
      grid.innerHTML = `
        <div class="text-center py-12">
          <p class="text-gray-600">Öne çıkan ürünler yüklenirken bir hata oluştu.</p>
          <p class="text-sm text-gray-500 mt-2">${error.message}</p>
        </div>
      `;
    }
  }
};

const renderFeaturedProducts = (products) => {
  const grid = document.getElementById('featuredProductsGrid');
  if (!grid) return;
  
  if (products.length === 0) {
    grid.innerHTML = `
      <div class="text-center py-12">
        <p class="text-gray-600">Henüz ürün bulunmuyor.</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = products.map(product => createProductCard(product)).join('');
};

// View All Products Button
const viewAllProductsBtn = document.getElementById('viewAllProductsBtn');
viewAllProductsBtn?.addEventListener('click', () => {
  // Sağ paneli aç
  const productsPanel = document.getElementById('productsPanel');
  if (productsPanel) {
    productsPanel.classList.remove('translate-x-full');
    // Panel açıldığında tüm ürünleri yükle
    fetchAndRenderPanelProducts('');
    
    // Panel açıldıktan sonra arama input'una focus ol
    setTimeout(() => {
      const panelSearchInput = document.getElementById('panelSearchInput');
      if (panelSearchInput) {
        panelSearchInput.focus();
      }
      
      // Panel içindeki scroll pozisyonunu sıfırla
      const panelScrollContainer = productsPanel.querySelector('.overflow-y-auto');
      if (panelScrollContainer) {
        panelScrollContainer.scrollTop = 0;
      }
    }, 300); // Panel açılma animasyonundan sonra
  }
});

// Geri dön butonu
backToCategoriesBtnMobile?.addEventListener('click', () => {
  mobileProductsSection?.classList.add('hidden');
  selectedCategoryId = null;
  selectedCategoryTitle = null;
  backToCategoriesBtnMobile?.classList.add('hidden');
});

// Masaüstü kategoriler menüsünü yükle
const loadDesktopCategories = async () => {
  try {
    console.log('🔍 Masaüstü kategoriler yükleniyor...');
    const categories = await fetchJSON('/api/categories');
    console.log('📦 Kategoriler alındı:', categories);
    
    const desktopCategoriesList = document.getElementById('desktopCategoriesList');
    console.log('🎯 Desktop categories list element:', desktopCategoriesList);
    
    if (desktopCategoriesList && categories.length > 0) {
      console.log('✅ Kategoriler yükleniyor...');
      const categoriesHTML = categories.map(category => `
        <button 
          class="px-2 sm:px-4 py-1.5 sm:py-2 text-gray-600 hover:text-accent-600 hover:bg-white/20 transition-all duration-300 font-medium text-sm sm:text-base rounded-lg sm:rounded-xl whitespace-nowrap"
          onclick="selectCategoryFromDesktop('${category._id}', '${category.name}')"
        >
          ${category.name}
        </button>
      `).join('');
      
      console.log('🎨 HTML oluşturuldu:', categoriesHTML);
      desktopCategoriesList.innerHTML = categoriesHTML;
      console.log('✅ Kategoriler başarıyla yüklendi!');
    } else {
      console.log('❌ Desktop categories list bulunamadı veya kategoriler boş');
      console.log('Element:', desktopCategoriesList);
      console.log('Kategoriler:', categories);
    }
  } catch (error) {
    console.error('❌ Masaüstü kategoriler yüklenirken hata:', error);
  }
};

// Masaüstü kategoriler menüsünden kategori seçimi
const selectCategoryFromDesktop = (categoryId, categoryName) => {
  selectedCategoryId = categoryId;
  selectedCategoryTitle = categoryName;
  
  // Ürünler bölümüne scroll yap
  const productsSection = document.getElementById('products');
  if (productsSection) {
    productsSection.scrollIntoView({ behavior: 'smooth' });
  }
  
  // Ürünleri yükle
  fetchAndRenderProducts('', false, categoryId);
  
  // Seçilen kategoriyi vurgula
  updateCategorySelection(categoryId);
  
  // Masaüstü kategori butonlarında seçimi vurgula
  updateDesktopCategorySelection(categoryId);
};

// Kategori seçimini güncelle
const updateCategorySelection = (selectedId) => {
  // Tüm kategori kartlarından seçim işaretini kaldır
  const allCategoryCards = document.querySelectorAll('.category-card');
  allCategoryCards.forEach(card => {
    card.classList.remove('category-selected');
  });
  
  // Seçilen kategoriyi işaretle
  if (selectedId) {
    const selectedCard = document.querySelector(`[data-category-id="${selectedId}"]`);
    if (selectedCard) {
      selectedCard.classList.add('category-selected');
    }
  }
};

// Masaüstü kategori butonlarında seçimi güncelle
const updateDesktopCategorySelection = (selectedId) => {
  // Tüm masaüstü kategori butonlarından seçim işaretini kaldır
  const allDesktopButtons = document.querySelectorAll('#desktopCategoriesList button');
  allDesktopButtons.forEach(btn => {
    btn.classList.remove('bg-accent-500', 'text-white');
    btn.classList.add('text-gray-600', 'hover:text-accent-600');
  });
  
  // Seçilen kategoriyi işaretle
  if (selectedId) {
    const selectedButton = document.querySelector(`#desktopCategoriesList button[onclick*="${selectedId}"]`);
    if (selectedButton) {
      selectedButton.classList.remove('text-gray-600', 'hover:text-accent-600');
      selectedButton.classList.add('bg-accent-500', 'text-white');
    }
  }
};

// Üst bardaki kategori butonlarından kategori seçimi
const selectCategoryFromHeader = (categoryName) => {
  console.log('🎯 Kategori seçildi:', categoryName);
  
  // Kategori butonunda seçimi vurgula
  updateDesktopCategorySelection(categoryName);
  
  // Ürünler bölümüne scroll yap
  const productsSection = document.getElementById('products');
  if (productsSection) {
    productsSection.scrollIntoView({ behavior: 'smooth' });
  }
  
  // Kategori adını güncelle
  selectedCategoryTitle = categoryName;
  
  // Ürünleri filtrele ve göster - fetchAndRenderProducts'i kategori adıyla çağır
  fetchAndRenderProducts('', false, categoryName);
  
  // Ürün başlığını güncelle
  updateProductsTitle(categoryName);
};

// Kategoriye göre ürünleri filtrele
const filterProductsByCategory = async (categoryName) => {
  try {
    console.log('🔍 Kategori ürünleri aranıyor:', categoryName);
    
    // Tüm ürünleri al
    const allProducts = await fetchJSON('/api/products');
    
    // Kategoriye göre filtrele
    const filteredProducts = allProducts.filter(product => {
      return product.categoryId && product.categoryId.name === categoryName;
    });
    
    console.log('📦 Filtrelenmiş ürünler:', filteredProducts);
    
    // Ürünleri göster
    renderFilteredProducts(filteredProducts, categoryName);
    
  } catch (error) {
    console.error('❌ Kategori ürünleri filtrelenirken hata:', error);
  }
};

// Filtrelenmiş ürünleri göster
const renderFilteredProducts = (products, categoryName) => {
  const productsGrid = document.getElementById('productsGrid');
  if (!productsGrid) return;
  
  if (products.length === 0) {
    productsGrid.innerHTML = `
      <div class="col-span-full text-center py-16">
        <div class="inline-flex flex-col items-center gap-4 p-8 bg-gray-50 border border-gray-200 rounded-2xl">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
            </svg>
          </div>
          <div class="text-center">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">Ürün Bulunamadı</h3>
            <p class="text-gray-600 mb-4">"${categoryName}" kategorisinde henüz ürün bulunmuyor.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  // Ürün kartlarını oluştur
  productsGrid.innerHTML = products.map(product => createProductCard(product)).join('');
};

// Ürün başlığını güncelle
const updateProductsTitle = (title) => {
  const productsTitle = document.getElementById('productsTitle');
  if (productsTitle) {
    if (title.includes('Kampanyalı')) {
      productsTitle.innerHTML = `${title} <span class="gradient-text">Kampanya</span>`;
    } else if (title.includes('Ürünler')) {
      productsTitle.innerHTML = `${title} <span class="gradient-text">Ürünler</span>`;
    } else {
      productsTitle.innerHTML = `<span class="gradient-text">${title}</span> Ürünleri`;
    }
    console.log('✅ Ürün başlığı güncellendi:', title);
  } else {
    console.error('❌ productsTitle elementi bulunamadı!');
  }
};

// Ürünleri göster (kampanya filtreleme için)
const displayProducts = (products) => {
  if (!productsGrid) return;
  
  if (products.length === 0) {
    productsGrid.innerHTML = `
      <div class="col-span-full text-center py-16">
        <div class="inline-flex flex-col items-center gap-4 p-8 bg-gray-50 border border-gray-200 rounded-2xl">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <div class="text-center">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">Ürün Bulunamadı</h3>
            <p class="text-gray-600 mb-4">Seçilen kriterlere uygun ürün bulunamadı.</p>
          </div>
        </div>
      </div>
    `;
  } else {
    productsGrid.innerHTML = products.map(product => createProductCard(product)).join('');
  }
};

// Arama sonuçlarını yükle ve göster
const fetchAndRenderSearchResults = async (query) => {
  try {
    // Loading state'i göster
    showSearchLoading(true);
    
    const data = await fetchJSON(`/api/products?q=${encodeURIComponent(query)}`);
    
    // Loading state'i gizle
    showSearchLoading(false);
    
    const searchResultsGrid = document.getElementById('searchResultsGrid');
    const searchResultsCount = document.getElementById('searchResultsCount');
    
    if (searchResultsCount) {
      searchResultsCount.textContent = `${data.length} sonuç bulundu`;
    }
    
    if (searchResultsGrid) {
      if (data.length === 0) {
        searchResultsGrid.innerHTML = `
          <div class="col-span-full text-center py-16">
            <div class="inline-flex flex-col items-center gap-4 p-8 bg-gray-50 border border-gray-200 rounded-2xl">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
              <div class="text-center">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Sonuç Bulunamadı</h3>
                <p class="text-gray-600 mb-4">"${query}" için arama kriterlerinize uygun ürün bulunamadı.</p>
                <p class="text-sm text-gray-500">Farklı anahtar kelimeler deneyebilir veya kategorilere göz atabilirsiniz.</p>
              </div>
            </div>
          </div>
        `;
      } else {
        // Arama sonuçlarını göster
        const productsHTML = data.map(product => createProductCard(product)).join('');
        searchResultsGrid.innerHTML = productsHTML;
      }
    }
  } catch (error) {
    // Loading state'i gizle
    showSearchLoading(false);
    
    console.error('Arama sonuçları yüklenirken hata:', error);
    const searchResultsGrid = document.getElementById('searchResultsGrid');
    if (searchResultsGrid) {
      searchResultsGrid.innerHTML = `
        <div class="col-span-full text-center py-16">
          <div class="inline-flex flex-col items-center gap-4 p-8 bg-red-50 border border-red-200 rounded-2xl">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.800 2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <div class="text-center">
              <h3 class="text-lg font-semibold text-red-800 mb-2">Arama Hatası</h3>
              <p class="text-red-600 mb-4">Arama yapılırken bir hata oluştu. Lütfen tekrar deneyin.</p>
            </div>
          </div>
        </div>
      `;
    }
  }
};

// Arama loading state'lerini göster/gizle
const showSearchLoading = (show) => {
  const searchLoading = document.getElementById('searchLoading');
  const mobileSearchLoading = document.getElementById('mobileSearchLoading');
  
  if (searchLoading) {
    searchLoading.classList.toggle('hidden', !show);
  }
  
  if (mobileSearchLoading) {
    mobileSearchLoading.classList.toggle('hidden', !show);
  }
};

// Kategori tıklama işleyicisi - artık kullanılmıyor, link ile yönlendirme yapılıyor
// const handleCategoryClick = (id, title) => {
//   // Bu fonksiyon artık kullanılmıyor
// };

// Countdown Timer Functions
let countdownInterval = null;
let currentCampaign = null;

// Kampanya verilerini yükle ve countdown timer'ı başlat
const loadCampaignAndStartCountdown = async () => {
  try {
    const campaigns = await fetchJSON('/api/campaigns');
    
    // Aktif kampanyaları global olarak sakla
    window.activeCampaigns = campaigns.filter(campaign => campaign.isActive);
    
    if (campaigns.length > 0) {
      // En yakın bitiş tarihine sahip kampanyayı seç
      currentCampaign = campaigns.reduce((closest, current) => {
        const closestEnd = new Date(closest.endDate);
        const currentEnd = new Date(current.endDate);
        return currentEnd < closestEnd ? current : closest;
      });
      
      // Countdown timer'ı göster ve başlat
      showCountdownTimer();
      startCountdown();
    }
  } catch (error) {
    console.error('Kampanya yüklenirken hata:', error);
  }
};

// Countdown timer'ı göster
const showCountdownTimer = () => {
  const countdownSection = document.getElementById('countdownSection');
  const campaignTitle = document.getElementById('campaignTitle');
  const campaignImageContainer = document.getElementById('campaignImageContainer');
  const campaignImage = document.getElementById('campaignImage');
  
  if (countdownSection && currentCampaign) {
    countdownSection.classList.remove('hidden');
    
    if (campaignTitle) {
      campaignTitle.innerHTML = `
        <span class="gradient-text">${currentCampaign.name || 'Kampanya'}</span> Sona Eriyor!
      `;
    }
    
    // Kampanya görselini göster (eğer varsa)
    if (campaignImageContainer && campaignImage) {
      if (currentCampaign.imageUrl) {
        campaignImage.src = currentCampaign.imageUrl;
        campaignImageContainer.classList.remove('hidden');
      } else {
        campaignImageContainer.classList.add('hidden');
      }
    }
  }
};

// Countdown timer'ı başlat
const startCountdown = () => {
  if (!currentCampaign) return;
  
  const updateCountdown = () => {
    const now = new Date().getTime();
    const endDate = new Date(currentCampaign.endDate).getTime();
    const timeLeft = endDate - now;
    
    if (timeLeft <= 0) {
      // Kampanya bitti
      stopCountdown();
      hideCountdownTimer();
      return;
    }
    
    // Zaman hesaplamaları
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    // DOM'u güncelle
    updateCountdownDisplay(days, hours, minutes, seconds);
  };
  
  // İlk güncelleme
  updateCountdown();
  
  // Her saniye güncelle
  countdownInterval = setInterval(updateCountdown, 1000);
};

// Countdown display'i güncelle
const updateCountdownDisplay = (days, hours, minutes, seconds) => {
  const daysEl = document.getElementById('countdownDays');
  const hoursEl = document.getElementById('countdownHours');
  const minutesEl = document.getElementById('countdownMinutes');
  const secondsEl = document.getElementById('countdownSeconds');
  
  if (daysEl) daysEl.textContent = days.toString().padStart(2, '0');
  if (hoursEl) hoursEl.textContent = hours.toString().padStart(2, '0');
  if (minutesEl) minutesEl.textContent = minutes.toString().padStart(2, '0');
  if (secondsEl) secondsEl.textContent = seconds.toString().padStart(2, '0');
};

// Countdown timer'ı durdur
const stopCountdown = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
};

// Countdown timer'ı gizle
const hideCountdownTimer = () => {
  const countdownSection = document.getElementById('countdownSection');
  if (countdownSection) {
    countdownSection.classList.add('hidden');
  }
};

// Kampanya ürünlerini yükle
const loadCampaignProducts = async () => {
  try {
    const campaigns = await fetchJSON('/api/campaigns');
    if (campaigns && Array.isArray(campaigns)) {
      // Aktif kampanyalardaki ürünleri topla
      const campaignProductIds = new Set();
      
      campaigns.forEach(campaign => {
        if (campaign.isActive) {
          if (campaign.type === 'products' && campaign.productIds && Array.isArray(campaign.productIds)) {
            // Ürün bazlı kampanya
            campaign.productIds.forEach(product => {
              if (product._id) {
                campaignProductIds.add(product._id);
              }
            });
          } else if (campaign.type === 'category' && campaign.targetId) {
            // Kategori bazlı kampanya - o kategorideki tüm ürünleri ekle
            allProducts.forEach(product => {
              if (product.categoryId && product.categoryId._id === campaign.targetId._id) {
                campaignProductIds.add(product._id);
              }
            });
          }
        }
      });
      
      // Kampanya ürünlerini filtrele
      campaignProducts = allProducts.filter(product => 
        campaignProductIds.has(product._id)
      );
      
      console.log('✅ Kampanya ürünleri yüklendi:', campaignProducts.length);
    }
  } catch (error) {
    console.error('❌ Kampanya ürünleri yüklenirken hata:', error);
    campaignProducts = [];
  }
};

// Öne çıkan ürünleri yükle
const loadFeaturedProducts = async () => {
  try {
    console.log('🔄 Öne çıkan ürünler yükleniyor...');
    
    const response = await fetch('/api/featured-products');
    if (!response.ok) {
      throw new Error('Öne çıkan ürünler alınamadı');
    }
    
    const featuredData = await response.json();
    console.log('📊 API\'den gelen veri:', featuredData);
    
    if (featuredData && featuredData.length > 0) {
      // Öne çıkan ürün verilerini global değişkene ata
      featuredProducts = featuredData;
      console.log('🔍 Global featuredProducts:', featuredProducts);
      
      // Ana sayfadaki öne çıkan ürünler bölümünü göster
      const featuredSection = document.getElementById('featuredProducts');
      if (featuredSection) {
        featuredSection.classList.remove('hidden');
      }
      
      displayFeaturedProducts();
      console.log('✅ Öne çıkan ürünler yüklendi:', featuredData.length);
    } else {
      // Öne çıkan ürün yoksa ana sayfadaki bölümü gizle
      const featuredSection = document.getElementById('featuredProducts');
      if (featuredSection) {
        featuredSection.classList.add('hidden');
      }
      
      // Öne çıkan ürün yoksa mesaj göster
      const featuredGrid = document.getElementById('featuredProductsGrid');
      if (featuredGrid) {
        featuredGrid.innerHTML = `
          <div class="col-span-full text-center py-16">
            <div class="bg-gray-50 border border-gray-200 rounded-2xl p-8">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-gray-800 mb-2">Henüz Öne Çıkan Ürün Yok</h3>
              <p class="text-gray-600 mb-4">Şu anda öne çıkan ürün bulunmuyor. Tüm ürünlerimizi keşfetmeye devam edin!</p>
              <button 
                onclick="document.getElementById('products').scrollIntoView({ behavior: 'smooth' });"
                class="px-6 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
              >
                Tüm Ürünleri Gör
              </button>
            </div>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('❌ Öne çıkan ürünler yüklenirken hata:', error);
    
    // Hata durumunda ana sayfadaki öne çıkan ürünler bölümünü gizle
    const featuredSection = document.getElementById('featuredProducts');
    if (featuredSection) {
      featuredSection.classList.add('hidden');
    }
    
    // Hata durumunda mesaj göster
    const featuredGrid = document.getElementById('featuredProductsGrid');
    if (featuredGrid) {
      featuredGrid.innerHTML = `
        <div class="col-span-full text-center py-16">
          <div class="bg-red-50 border border-red-200 rounded-2xl p-8">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-red-800 mb-2">Yükleme Hatası</h3>
            <p class="text-red-600 mb-4">Öne çıkan ürünler yüklenirken bir hata oluştu.</p>
            <button onclick="loadFeaturedProducts()" class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              Tekrar Dene
            </button>
          </div>
        </div>
      `;
    }
  }
};

// Öne çıkan ürünler için slider değişkenleri
let featuredCurrentSlide = 0;
let featuredTotalSlides = 0;
let featuredProductsPerView = 4; // Varsayılan olarak 4 ürün
let featuredStepPx = 0; // Ölçülen adım (slide genişliği + gap)
let featuredMaxTranslatePx = 0; // İçeriğin maksimum kaydırılabilecek mesafesi

// Responsive olarak ürün sayısını ayarla
const updateFeaturedProductsPerView = () => {
  if (window.innerWidth < 640) { // sm
    featuredProductsPerView = 1;
  } else if (window.innerWidth < 768) { // md
    featuredProductsPerView = 2;
  } else if (window.innerWidth < 1024) { // lg
    featuredProductsPerView = 3;
  } else {
    featuredProductsPerView = 4;
  }
};

// Mevcut ekran boyutuna göre ürün sayısını döndür
const getFeaturedProductsPerView = () => {
  if (window.innerWidth < 640) return 1; // sm
  if (window.innerWidth < 768) return 2; // md
  if (window.innerWidth < 1024) return 3; // lg
  return 4; // xl
};

// Her slide için genişlik hesapla (px cinsinden)
const getFeaturedSlideWidth = () => {
  if (window.innerWidth < 640) {
    // Mobil: 280px
    return 280;
  } else if (window.innerWidth < 768) {
    // Tablet: 320px
    return 320;
  } else if (window.innerWidth < 1024) {
    // Laptop: 280px
    return 280;
  } else {
    // Desktop: 240px
    return 240;
  }
};

// Öne çıkan ürünler için özel kart oluştur
const createFeaturedProductCard = (product) => {
  const img = product.imageUrl || 'https://images.unsplash.com/photo-1520975922284-6c62f25a1c9b?q=80&w=800&auto=format&fit=crop';
  const hasCustomImage = !!product.imageUrl;
  const isVariant = product.isVariant || false;
  const variantColor = product.variantColor || '';
  
  return `
    <div class="featured-product-card flex-shrink-0 w-full sm:w-[calc(50%-1rem)] md:w-[calc(33.333%-1.33rem)] lg:w-[calc(25%-1.5rem)] group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-500 text-left bg-white/95 backdrop-blur-sm border border-white/40 hover:border-accent-200/60">
      <div class="overflow-hidden relative aspect-[4/5]">
        <img src="${img}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"/>
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
        
        <!-- Featured Badge -->
        <div class="absolute top-3 left-3 w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center border-2 border-white/30 shadow-lg">
          <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </div>
        
        <!-- Image Status Badge -->
        <div class="absolute top-3 right-3 w-6 h-6 rounded-full text-xs flex items-center justify-center ${hasCustomImage ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}" title="${hasCustomImage ? 'Özel Görsel' : 'Varsayılan Görsel'}">
          ${hasCustomImage ? '✓' : '!'}
        </div>
        
        <!-- Variant Badge -->
        ${isVariant ? `<div class="absolute bottom-3 left-3 bg-purple-500 text-white text-xs px-2 py-1 rounded-full shadow-lg">Varyant</div>` : ''}
        
        <!-- Hover Effect -->
        <div class="absolute inset-0 bg-gradient-to-t from-accent-500/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      </div>
      
      <div class="p-4 sm:p-5">
        <div class="mb-3">
          <h3 class="text-lg sm:text-xl font-bold text-gray-800 mb-2 group-hover:text-accent-600 transition-colors duration-300 line-clamp-2">
            ${product.name}
          </h3>
          ${isVariant ? `<div class="text-sm text-purple-600 flex items-center gap-2 mb-2"><span class="w-3 h-3 rounded-full border" style="background-color: ${product.mainColorHex || '#000000'}"></span>🎨 ${variantColor} varyantı</div>` : ''}
          ${!isVariant && product.mainColor ? `<div class="text-sm text-blue-600 flex items-center gap-2 mb-2"><span class="w-3 h-3 rounded-full border" style="background-color: ${product.mainColorHex || '#000000'}"></span>${product.mainColor}</div>` : ''}
        </div>
        
        <div class="flex items-center justify-between mb-3">
          <div class="text-2xl font-bold text-accent-600">
            ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(product.price)}
          </div>
          <div class="text-sm text-gray-500">
            ${product.categoryId?.name || 'Kategori Yok'}
          </div>
        </div>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1 text-accent-600 font-medium text-sm">
            <span>Detayları Gör</span>
            <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
          
          <button onclick="handleProductClick('${product._id}', '${product.name}')" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-lg transition-colors duration-300 transform hover:scale-105">
            İncele
          </button>
        </div>
      </div>
    </div>
  `;
};

// Öne çıkan ürünleri görüntüle
const displayFeaturedProducts = () => {
  console.log('🎨 displayFeaturedProducts çağrıldı');
  console.log('🔍 featuredProducts:', featuredProducts);
  
  if (!featuredProducts || featuredProducts.length === 0) {
    console.log('❌ Öne çıkan ürün yok veya boş');
    return;
  }
  
  console.log('✅ Öne çıkan ürünler bulundu, HTML oluşturuluyor...');
  
  // Var olan "#featuredProducts" bölümünün içine slider'ı yerleştir
  const section = document.getElementById('featuredProducts');
  const container = section ? section.querySelector('div.relative') : null;
  if (!section || !container) {
    console.warn('⚠️ #featuredProducts bölümü bulunamadı, fallback olarak kategori öncesine ekleniyor');
    const fallback = document.getElementById('categories');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div id="featuredSliderBlock"></div>`;
    if (fallback && fallback.parentNode) fallback.parentNode.insertBefore(wrapper, fallback);
  }
  
  // Önceki blok varsa temizle
  let block = document.getElementById('featuredSliderBlock');
  if (!block) {
    block = document.createElement('div');
    block.id = 'featuredSliderBlock';
    block.className = 'relative mt-6 sm:mt-10';
    (container || document.body).insertBefore(block, (container && container.lastElementChild) || null);
  } else {
    block.innerHTML = '';
  }
  
  block.innerHTML = `
    <!-- Navigation Buttons -->
    <button id="featuredPrevBtn" class="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg hover:bg-white transition-all duration-300 flex items-center justify-center text-gray-600 hover:text-accent-600 disabled:opacity-50 disabled:cursor-not-allowed">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
    </button>
    <button id="featuredNextBtn" class="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg hover:bg-white transition-all duration-300 flex items-center justify-center text-gray-600 hover:text-accent-600 disabled:opacity-50 disabled:cursor-not-allowed">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    </button>
    <div class="overflow-hidden">
      <div id="featuredSlider" class="flex transition-transform duration-500 ease-in-out scroll-smooth" style="transform: translateX(0%)">
        ${featuredProducts.map(item => `
          <div class="featured-slide flex-shrink-0 w-[280px] sm:w-[320px] md:w-[280px] lg:w-[240px] mr-4 last:mr-0">
            ${createProductCard(item.productId)}
          </div>
        `).join('')}
      </div>
    </div>
    <div id="featuredDots" class="flex justify-center gap-2 mt-6">
      ${Array.from({ length: Math.max(1, featuredProducts.length - getFeaturedProductsPerView() + 1) }, (_, i) => `
        <button class="featured-dot w-3 h-3 rounded-full transition-all duration-300 ${i === 0 ? 'bg-accent-500 scale-125' : 'bg-gray-300 hover:bg-gray-400'}" data-slide="${i}"></button>
      `).join('')}
    </div>
  `;
  
  // Bölümü görünür yap
  section?.classList.remove('hidden');
  // Slider'ı aktif hale getir
  setupFeaturedSlider();
};

// Ölçüm: adım ve maksimum kaydırma mesafesini hesapla
const measureFeatured = () => {
  const slider = document.getElementById('featuredSlider');
  if (!slider) return;
  const slides = Array.from(slider.querySelectorAll('.featured-slide'));
  if (slides.length === 0) return;
  const first = slides[0];
  const firstStyle = window.getComputedStyle(first);
  const mr = parseFloat(firstStyle.marginRight) || 0;
  featuredStepPx = first.offsetWidth + mr;
  // Toplam içerik genişliği (son elemanın sağ marjını zaten 0 verdik)
  const totalWidth = slides.reduce((sum, el) => {
    const s = window.getComputedStyle(el);
    return sum + el.offsetWidth + (parseFloat(s.marginRight) || 0);
  }, 0);
  const containerWidth = slider.parentElement ? slider.parentElement.clientWidth : window.innerWidth;
  featuredMaxTranslatePx = Math.max(0, totalWidth - containerWidth);
};

// Slider pozisyonunu güncelle (ölçümlere göre)
const updateFeaturedSliderPosition = () => {
  const featuredSlider = document.getElementById('featuredSlider');
  if (!featuredSlider) return;
  // Aktüel ölçüm yoksa ölç
  if (!featuredStepPx || !Number.isFinite(featuredStepPx)) measureFeatured();
  const rawTranslate = featuredCurrentSlide * featuredStepPx;
  const translateX = -Math.min(rawTranslate, featuredMaxTranslatePx);
  featuredSlider.style.transform = `translateX(${translateX}px)`;
};

// Dots'ları güncelle
const updateFeaturedDots = () => {
  const dots = document.querySelectorAll('.featured-dot');
  dots.forEach((dot, index) => {
    if (index === featuredCurrentSlide) {
      dot.classList.add('bg-accent-500', 'scale-125');
      dot.classList.remove('bg-gray-300');
    } else {
      dot.classList.remove('bg-accent-500', 'scale-125');
      dot.classList.add('bg-gray-300');
    }
  });
};

// Belirli slide'a git
const goToFeaturedSlide = (slideIndex) => {
  featuredCurrentSlide = Math.max(0, Math.min(slideIndex, featuredTotalSlides));
  updateFeaturedSliderPosition();
  updateFeaturedDots();
  updateFeaturedNavigationButtons();
};

// Navigation butonlarını güncelle
const updateFeaturedNavigationButtons = () => {
  const prevBtn = document.getElementById('featuredPrevBtn');
  const nextBtn = document.getElementById('featuredNextBtn');
  
  if (prevBtn) {
    prevBtn.disabled = featuredCurrentSlide === 0;
    prevBtn.classList.toggle('opacity-50', featuredCurrentSlide === 0);
    prevBtn.classList.toggle('cursor-not-allowed', featuredCurrentSlide === 0);
  }
  
  if (nextBtn) {
    nextBtn.disabled = featuredCurrentSlide === featuredTotalSlides;
    nextBtn.classList.toggle('opacity-50', featuredCurrentSlide === featuredTotalSlides);
    nextBtn.classList.toggle('cursor-not-allowed', featuredCurrentSlide === featuredTotalSlides);
  }
};

// Slider'ı kur
const setupFeaturedSlider = () => {
  const prevBtn = document.getElementById('featuredPrevBtn');
  const nextBtn = document.getElementById('featuredNextBtn');
  const dots = document.querySelectorAll('.featured-dot');
  
  // Slider değişkenlerini sıfırla ve ölç
  featuredCurrentSlide = 0;
  measureFeatured();
  // Toplam adım sayısını öğe sayısına göre belirle (daha güvenilir)
  featuredTotalSlides = Math.max(0, (featuredProducts?.length || 0) - getFeaturedProductsPerView());
  
  // Navigation butonlarını güncelle
  updateFeaturedNavigationButtons();
  
  // Eğer toplam slide sayısı 0'dan küçükse dots'ları gizle
  const dotsContainer = document.getElementById('featuredDots');
  if (dotsContainer) {
    dotsContainer.style.display = featuredTotalSlides > 0 ? 'flex' : 'none';
  }
  
  // Prev buton
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (featuredCurrentSlide > 0) {
        goToFeaturedSlide(featuredCurrentSlide - 1);
      }
    });
  }
  
  // Next buton
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (featuredCurrentSlide < featuredTotalSlides) {
        goToFeaturedSlide(featuredCurrentSlide + 1);
      }
    });
  }
  
  // Dots yeniden oluştur (ölçüme göre)
  // Dots container'ı yeniden kur
  const dotsContainerEl = document.getElementById('featuredDots');
  if (dotsContainerEl) {
    const needed = featuredTotalSlides + 1;
    dotsContainerEl.innerHTML = Array.from({ length: needed }, (_, i) => `
      <button class="featured-dot w-3 h-3 rounded-full transition-all duration-300 ${i === 0 ? 'bg-accent-500 scale-125' : 'bg-gray-300 hover:bg-gray-400'}" data-slide="${i}"></button>
    `).join('');
  }
  document.querySelectorAll('.featured-dot').forEach((dot, index) => {
    dot.addEventListener('click', () => goToFeaturedSlide(index));
  });
  
  // Touch/swipe desteği ekle
  let startX = 0;
  let currentX = 0;
  const slider = document.getElementById('featuredSlider');
  
  if (slider) {
    slider.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    });
    
    slider.addEventListener('touchmove', (e) => {
      currentX = e.touches[0].clientX;
    });
    
    slider.addEventListener('touchend', () => {
      const diff = startX - currentX;
      const threshold = 50;
      
      if (Math.abs(diff) > threshold) {
        if (diff > 0 && featuredCurrentSlide < featuredTotalSlides) {
          // Sola kaydır - sonraki slide
          goToFeaturedSlide(featuredCurrentSlide + 1);
        } else if (diff < 0 && featuredCurrentSlide > 0) {
          // Sağa kaydır - önceki slide
          goToFeaturedSlide(featuredCurrentSlide - 1);
        }
      }
    });
  }
  
  // Window resize event'i
  window.addEventListener('resize', () => {
    const prevIndex = featuredCurrentSlide;
    measureFeatured();
    featuredTotalSlides = Math.max(0, (featuredProducts?.length || 0) - getFeaturedProductsPerView());
    featuredCurrentSlide = Math.min(prevIndex, featuredTotalSlides);
    updateFeaturedSliderPosition();
    updateFeaturedDots();
    updateFeaturedNavigationButtons();
    const dotsUpdate = document.getElementById('featuredDots');
    if (dotsUpdate) dotsUpdate.style.display = featuredTotalSlides > 0 ? 'flex' : 'none';
  });
};

// Kampanya filtreleme butonları için event listener'lar
const setupCampaignFilterButtons = () => {
  const showAllProductsBtn = document.getElementById('showAllProducts');
  const showCampaignProductsBtn = document.getElementById('showCampaignProducts');
  
  if (showAllProductsBtn && showCampaignProductsBtn) {
    showAllProductsBtn.addEventListener('click', () => {
      isShowingAllProducts = true;
      isShowingCampaignProducts = false;
      updateFilterButtonStyles();
      displayProducts(allProducts);
      updateProductsTitle('Tüm Ürünler');
    });
    
    showCampaignProductsBtn.addEventListener('click', () => {
      isShowingAllProducts = false;
      isShowingCampaignProducts = true;
      updateFilterButtonStyles();
      displayProducts(campaignProducts);
      updateProductsTitle('Kampanyalı Ürünler');
    });
  }
};

// Filtreleme butonlarının stillerini güncelle
const updateFilterButtonStyles = () => {
  const showAllProductsBtn = document.getElementById('showAllProducts');
  const showCampaignProductsBtn = document.getElementById('showCampaignProducts');
  
  if (showAllProductsBtn && showCampaignProductsBtn) {
    if (isShowingAllProducts) {
      showAllProductsBtn.className = 'px-6 py-3 rounded-xl font-medium transition-all duration-300 bg-accent-500 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5';
      showCampaignProductsBtn.className = 'px-6 py-3 rounded-xl font-medium transition-all duration-300 text-gray-600 hover:text-gray-800 hover:bg-white/50';
    } else {
      showAllProductsBtn.className = 'px-6 py-3 rounded-xl font-medium transition-all duration-300 text-gray-600 hover:text-gray-800 hover:bg-white/50';
      showCampaignProductsBtn.className = 'px-6 py-3 rounded-xl font-medium transition-all duration-300 bg-accent-500 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5';
    }
  }
};

// Kampanya ürünlerini göster ve products bölümüne scroll yap
const showCampaignProducts = () => {
  // Kampanya ürünlerini yükle
  loadCampaignProducts().then(() => {
    // Kampanya ürünlerini göster
    isShowingAllProducts = false;
    isShowingCampaignProducts = true;
    
    // Ürünleri göster
    if (campaignProducts.length > 0) {
      displayProducts(campaignProducts);
      updateProductsTitle('Kampanyalı Ürünler');
    } else {
      // Kampanya ürünü yoksa tüm ürünleri göster ama mesaj ver
      displayProducts(allProducts);
      updateProductsTitle('Kampanya Ürünleri Bulunamadı');
      
      // Kullanıcıya bilgi ver
      const productsGrid = document.getElementById('productsGrid');
      if (productsGrid) {
        const infoMessage = document.createElement('div');
        infoMessage.className = 'col-span-full text-center py-8';
        infoMessage.innerHTML = `
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div class="flex items-center justify-center gap-3 mb-3">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span class="text-blue-800 font-medium">Şu anda aktif kampanya bulunmuyor</span>
            </div>
            <p class="text-blue-600 text-sm">Tüm ürünlerimizi keşfetmeye devam edin!</p>
          </div>
        `;
        productsGrid.insertBefore(infoMessage, productsGrid.firstChild);
      }
    }
    
    // Products bölümüne scroll yap
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  });
};

// Sayfa yüklendiğinde countdown timer'ı başlat ve kampanya filtreleme butonlarını kur
document.addEventListener('DOMContentLoaded', () => {
  loadCampaignAndStartCountdown();
  setupCampaignFilterButtons();
  // loadFeaturedProducts() zaten ana sayfa yüklendiğinde çağrılıyor, burada tekrar çağırmaya gerek yok
});

// Global fonksiyonları window objesine ekle
window.showAllProducts = showAllProducts;
window.selectMobileCategory = selectMobileCategory;




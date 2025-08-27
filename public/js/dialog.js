// Minimal, şık alert dialog - Tailwind ile çalışır
// confirm() mevcut yapıyı bozmamak için değiştirilmez

(function () {
	if (window.__CUSTOM_ALERT_INSTALLED__) return;
	window.__CUSTOM_ALERT_INSTALLED__ = true;

	function createAlertDOM() {
		const overlay = document.createElement('div');
		overlay.id = 'appAlertOverlay';
		overlay.className = 'fixed inset-0 z-[99999] hidden';

		overlay.innerHTML = `
		  <div class="min-h-full w-full grid place-items-center p-4">
		    <div class="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-[fadeIn_.2s_ease]" id="alertCard">
		      <div class="px-6 pt-6 pb-4">
		        <div class="flex items-start gap-3">
		          <div id="alertIcon" class="mt-1 w-9 h-9 rounded-xl bg-accent-100 text-accent-600 flex items-center justify-center shadow-sm">
		            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
		          </div>
		          <div class="flex-1">
		            <h3 id="alertTitle" class="text-lg font-semibold text-gray-900">Bilgi</h3>
		            <div id="alertMessage" class="mt-1.5 text-gray-700 leading-relaxed"></div>
		          </div>
		        </div>
		      </div>
		      <div class="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
		        <button id="alertCloseBtn" class="px-5 py-2 text-rose-600 font-semibold hover:bg-rose-50 rounded-xl transition-colors">Kapat</button>
		      </div>
		    </div>
		  </div>
		`;
		document.body.appendChild(overlay);
		return overlay;
	}

	const overlay = createAlertDOM();
	const closeBtn = overlay.querySelector('#alertCloseBtn');
	function close() {
		overlay.classList.add('hidden');
	}
	closeBtn.addEventListener('click', close);
	// Tek tık ile kapansın: overlay'in herhangi bir yerine tıklanınca kapat
	overlay.addEventListener('click', close);
	// Kartın içindeki herhangi bir tıkta da kapansın (tek tık davranışı)
	const card = overlay.querySelector('#alertCard');
	card?.addEventListener('click', close);
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
	});

	function setStyle(type) {
		const iconBox = overlay.querySelector('#alertIcon');
		if (!iconBox) return;
		const map = {
			info:   { box: 'bg-blue-100 text-blue-600', svg: '<path d="M13 16h-1v-4h-1m1-4h.01"/><circle cx="12" cy="12" r="9"/>' },
			success:{ box: 'bg-green-100 text-green-600', svg: '<path d="M5 13l4 4L19 7"/>' },
			error:  { box: 'bg-red-100 text-red-600', svg: '<path d="M6 18L18 6M6 6l12 12"/>' },
			warn:   { box: 'bg-yellow-100 text-yellow-600', svg: '<path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>' }
		};
		const cfg = map[type] || map.success;
		iconBox.className = `mt-1 w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${cfg.box}`;
		iconBox.innerHTML = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${cfg.svg}</svg>`;
	}

	// Mesaja göre otomatik tür ve başlık belirleme
	function inferTypeAndTitle(message) {
		try {
			const text = String(message || '').toLowerCase();
			if (/(\[?error\]?|hata|başarısız|invalid|geçersiz|olmadı|failed)/.test(text)) {
				return { type: 'error', title: 'Hata' };
			}
			if (/(uyarı|dikkat|warning|warn)/.test(text)) {
				return { type: 'warn', title: 'Uyarı' };
			}
			if (/(başarılı|tamam|ok|success|kaydedildi|eklendi|güncellendi|silindi)/.test(text)) {
				return { type: 'success', title: 'Başarılı' };
			}
			return { type: 'info', title: 'Bilgi' };
		} catch (_) {
			return { type: 'info', title: 'Bilgi' };
		}
	}

	function showAlert(message, options) {
		try {
			const { title = 'Bilgi', type = 'success', autoCloseMs = 0 } = options || {};
			setStyle(type);
			const titleEl = overlay.querySelector('#alertTitle');
			const msgEl = overlay.querySelector('#alertMessage');
			titleEl.textContent = title;

			// \n ile gelen satırları paragrafa çevir
			const parts = String(message || '').split('\n');
			msgEl.innerHTML = parts
				.filter(Boolean)
				.map((line) => `<p class="${parts.length>1 ? 'mb-1.5' : ''}">${line}</p>`)  
				.join('');

			overlay.classList.remove('hidden');

			if (autoCloseMs && Number.isFinite(autoCloseMs)) {
				setTimeout(close, autoCloseMs);
			}
		} catch (_) {
			// Her ihtimale karşı yerleşik alert'e düş
			window.__nativeAlert?.(message);
		}
	}

	// Yerleşik alert'i koru ve override et
	if (!window.__nativeAlert) window.__nativeAlert = window.alert.bind(window);
	window.alert = function (msg) {
		const inferred = inferTypeAndTitle(msg);
		showAlert(msg, inferred);
	};

	// İsteğe bağlı dışa aktarım
	window.showAlertDialog = showAlert;
})();



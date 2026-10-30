// ==========================================
// MODUL AUTO-UPDATE OTOMATIS TANPA REFRESH MANUAL
// Memastikan setiap kali aplikasi diupdate dan dipublish,
// pengguna langsung mendapatkan versi terbaru secara otomatis
// tanpa perlu merefresh atau membersihkan cache secara manual.
// ==========================================

import { registerSW } from 'virtual:pwa-register';

declare global {
  interface Window {
    __APP_BUILD_TIME__?: number;
    __IS_UPDATING__?: boolean;
  }
}

// Build time saat aplikasi ini dikompilasi (diinjeksi oleh Vite)
export const CURRENT_BUILD_TIME: number = 
  typeof __APP_BUILD_TIME__ !== 'undefined' 
    ? __APP_BUILD_TIME__ 
    : (typeof window !== 'undefined' && window.__APP_BUILD_TIME__) || Date.now();

let updateIntervalId: ReturnType<typeof setInterval> | null = null;
let isRefreshing = false;

/**
 * Melakukan reload halaman secara aman hanya 1 kali
 */
export function reloadToLatestVersion(): void {
  if (isRefreshing || (typeof window !== 'undefined' && window.__IS_UPDATING__)) return;
  isRefreshing = true;
  if (typeof window !== 'undefined') {
    window.__IS_UPDATING__ = true;
    // Beri jeda sangat singkat agar service worker baru selesai mengaktifkan cache baru
    setTimeout(() => {
      window.location.reload();
    }, 250);
  }
}

/**
 * Memeriksa apakah ada update versi baru di server
 */
export async function checkForAppUpdate(registration?: ServiceWorkerRegistration): Promise<boolean> {
  if (typeof window === 'undefined' || isRefreshing) return false;

  // 1. Cek update Service Worker
  if (registration) {
    try {
      await registration.update();
    } catch {
      // Abaikan jika offline
    }
  }

  // 2. Cek endpoint /version.json dengan cache-busting
  try {
    const timestamp = Date.now();
    const res = await fetch(`/version.json?_t=${timestamp}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.buildTime === 'number') {
        // Jika build time di server lebih baru dari yang sedang berjalan di browser pengguna
        if (data.buildTime > CURRENT_BUILD_TIME) {
          reloadToLatestVersion();
          return true;
        }
      }
    }
  } catch {
    // Mode offline: tidak perlu reload jika jaringan terputus
  }

  return false;
}

/**
 * Inisialisasi mekanisme Auto-Update PWA & Background Worker
 */
export function initAutoUpdate(): void {
  if (typeof window === 'undefined') return;

  // Dengarkan event controllerchange jika Service Worker baru mengambil kendali
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      reloadToLatestVersion();
    });
  }

  // Daftarkan Service Worker PWA dengan autoUpdate agresif
  let swRegistration: ServiceWorkerRegistration | undefined;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Saat Service Worker mendeteksi file bundle baru, update seketika!
      updateSW(true);
    },
    onRegisteredSW(swUrl, r) {
      swRegistration = r;
      if (r) {
        // Cek update awal
        checkForAppUpdate(r);

        // Cek update berkala setiap 20 detik saat aplikasi sedang dibuka
        if (!updateIntervalId) {
          updateIntervalId = setInterval(() => {
            checkForAppUpdate(r);
          }, 20000);
        }
      }
    }
  });

  // Saat pengguna membuka kembali tab / kembali ke aplikasi dari HP
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForAppUpdate(swRegistration);
    }
  });

  window.addEventListener('focus', () => {
    checkForAppUpdate(swRegistration);
  });

  // Cek update saat koneksi internet kembali online
  window.addEventListener('online', () => {
    checkForAppUpdate(swRegistration);
  });
}

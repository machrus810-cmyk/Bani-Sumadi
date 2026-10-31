// ==========================================
// BACKGROUND SERVICE & AUDIO KEEP-ALIVE ENGINE
// KHUSUS PWA & MOBILE BROWSER (ANDROID / IOS)
// Memastikan notifikasi hitung mundur waktu sholat
// dan alarm adzan tetap berjalan aktif terus-menerus
// saat aplikasi diminimalkan, layar HP dimatikan,
// atau saat berpindah ke aplikasi lain.
// ==========================================

import { formatCountdownHMS, PrayerItem, playPrayerAdhanSound, generateUpcomingPrayers } from './prayerTimes';

export interface BackgroundPrayerConfig {
  prayerName: string;
  timeStr: string;
  cityName: string;
  targetTimestamp: number;
  lat?: number;
  lng?: number;
  upcomingPrayers?: Array<{ id: string; name: string; timeStr: string; timestamp: number }>;
}

let keepAliveAudio: HTMLAudioElement | null = null;
let backgroundIntervalId: ReturnType<typeof setInterval> | null = null;
let currentConfig: BackgroundPrayerConfig | null = null;
let isKeepAliveRunning = false;
let lastNotifiedDueTime = 0;

// Data URI file audio WAV 1 detik berdurasi sangat singkat dan hening (in-audible)
// Berfungsi untuk mengaktifkan status Foreground Media Service di sistem operasi Android
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Inisialisasi audio hening di latar belakang
 * Android OS memperlakukan tab browser yang sedang memutar audio sebagai Foreground Media Service,
 * sehingga thread JavaScript, timer, dan Service Worker tidak dibekukan (frozen) oleh sistem.
 */
function initSilentAudio(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (!keepAliveAudio) {
      const audio = new Audio(SILENT_WAV_BASE64);
      audio.loop = true;
      audio.volume = 0.01; // Nyaris nol, tidak terdengar di telinga
      audio.preload = 'auto';

      audio.addEventListener('ended', () => {
        if (isKeepAliveRunning) {
          audio.play().catch(() => {});
        }
      });

      audio.addEventListener('error', () => {
        // Fallback jika error
      });

      keepAliveAudio = audio;
    }

    const playPromise = keepAliveAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[BackgroundService] Autoplay hening menunggu interaksi pengguna:', err);
      });
    }

    return true;
  } catch (err) {
    console.warn('[BackgroundService] Gagal memulai audio keep-alive:', err);
    return false;
  }
}

/**
 * Konfigurasi MediaSession API Android
 * Menampilkan widget sholat di lock screen & status bar Android
 */
function updateMediaSession(config: BackgroundPrayerConfig, countdownText: string): void {
  if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

  try {
    // @ts-ignore
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: `🕌 Menuju ${config.prayerName} ${countdownText}`,
      artist: `Jadwal ${config.cityName} • Sholat pukul ${config.timeStr} WIB`,
      album: 'Keluarga Besar KH. Sumadi',
      artwork: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
      ]
    });

    // Handle aksi standar media agar tidak diputus oleh sistem
    navigator.mediaSession.setActionHandler('play', () => {
      if (keepAliveAudio) keepAliveAudio.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      // Biarkan tetap aktif jika pengguna tidak sengaja menekan
      if (isKeepAliveRunning && keepAliveAudio) {
        keepAliveAudio.play().catch(() => {});
      }
    });
  } catch {
    // Abaikan jika tidak didukung
  }
}

/**
 * Kirim notifikasi sistem secara langsung ke Service Worker atau Web Notification API
 */
async function dispatchLiveNotification(config: BackgroundPrayerConfig, countdownText: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = `🕌 Menuju ${config.prayerName} ${countdownText}`;
  const body = `Jadwal ${config.cityName} • Sholat ${config.prayerName} pukul ${config.timeStr} WIB`;

  // 1. Coba kirim via Service Worker dengan parameter ongoing: true
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'prayer-countdown-live',
          renotify: false,
          silent: true,
          ongoing: true, // Notifikasi mengambang tetap di status bar HP
          requireInteraction: true,
          timestamp: config.targetTimestamp,
          data: {
            url: '/?tab=dash&prayer=1',
            targetTimestamp: config.targetTimestamp
          },
          actions: [
            { action: 'open_prayer', title: '🕌 Buka Jadwal' },
            { action: 'stop_countdown', title: 'Matikan Notif' }
          ]
        } as any);

        // Kirim pembaruan ke Service Worker agar IndexedDB selalu tersinkron
        const payload = {
          type: 'SET_COUNTDOWN_NOTIFICATION',
          enabled: true,
          prayerName: config.prayerName,
          timeStr: config.timeStr,
          cityName: config.cityName,
          targetTimestamp: config.targetTimestamp,
          lat: config.lat,
          lng: config.lng,
          upcomingPrayers: config.upcomingPrayers || []
        };

        if (reg.active) {
          reg.active.postMessage(payload);
        } else if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(payload);
        }
        return;
      }
    } catch {
      // fallback
    }
  }

  // 2. Fallback Web Notification jika Service Worker belum siap
  try {
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'prayer-countdown-live',
      renotify: false,
      silent: true
    } as any);
  } catch {
    // abaikan
  }
}

/**
 * Bunyikan notifikasi adzan saat sholat tiba saat di background
 */
async function notifyPrayerDue(prayerName: string, timeStr: string, cityName: string): Promise<void> {
  const now = Date.now();
  if (now - lastNotifiedDueTime < 60000) return; // Cegah double trigger
  lastNotifiedDueTime = now;

  // 1. Putar nada seruan adzan
  try {
    await playPrayerAdhanSound();
  } catch {
    // ignore
  }

  // 2. Tampilkan notifikasi darurat sholat tiba
  const title = `🕌 Waktu Sholat ${prayerName} - ${cityName}`;
  const body = `Telah masuk waktu sholat ${prayerName} (${timeStr} WIB). Mari tunaikan ibadah sholat tepat waktu.`;

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [600, 200, 600, 200, 1000],
        tag: `prayer-due-${prayerName}-${new Date().toDateString()}`,
        requireInteraction: true,
        renotify: true,
        sound: '/notification.mp3',
        data: { url: '/?tab=dash&prayerAlarm=1' },
        actions: [
          { action: 'open_prayer', title: '🕌 Buka Jadwal' },
          { action: 'dismiss', title: 'Tutup' }
        ]
      } as any);
      return;
    } catch {
      // ignore
    }
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [600, 200, 600, 200, 1000]
      } as any);
    } catch {
      // ignore
    }
  }
}

/**
 * Satu siklus tick perhitungan hitung mundur latar belakang
 */
async function processBackgroundTick(): Promise<void> {
  if (!currentConfig || !isKeepAliveRunning) return;

  const now = Date.now();
  let diffMs = currentConfig.targetTimestamp - now;

  // Jika waktu sholat telah tiba
  if (diffMs <= 0) {
    await notifyPrayerDue(currentConfig.prayerName, currentConfig.timeStr, currentConfig.cityName);

    // Cari sholat berikutnya dari daftar upcomingPrayers
    let nextUpcoming = null;
    if (Array.isArray(currentConfig.upcomingPrayers)) {
      nextUpcoming = currentConfig.upcomingPrayers.find(p => p && p.timestamp > now);
    }

    if (nextUpcoming) {
      currentConfig.prayerName = nextUpcoming.name;
      currentConfig.timeStr = nextUpcoming.timeStr;
      currentConfig.targetTimestamp = nextUpcoming.timestamp;
      diffMs = currentConfig.targetTimestamp - now;
    } else if (currentConfig.lat && currentConfig.lng) {
      const refreshed = generateUpcomingPrayers(currentConfig.lat, currentConfig.lng, 7);
      currentConfig.upcomingPrayers = refreshed;
      nextUpcoming = refreshed.find(p => p.timestamp > now);
      if (nextUpcoming) {
        currentConfig.prayerName = nextUpcoming.name;
        currentConfig.timeStr = nextUpcoming.timeStr;
        currentConfig.targetTimestamp = nextUpcoming.timestamp;
        diffMs = currentConfig.targetTimestamp - now;
      }
    }
  }

  const totalSec = Math.max(0, Math.floor(diffMs / 1000));
  const countdownText = formatCountdownHMS(totalSec);

  // Perbarui notifikasi dan media session
  await dispatchLiveNotification(currentConfig, countdownText);
  updateMediaSession(currentConfig, countdownText);
}

/**
 * Aktifkan pemantauan hitung mundur di latar belakang HP
 */
export async function enableBackgroundCountdown(config: BackgroundPrayerConfig): Promise<void> {
  currentConfig = config;
  isKeepAliveRunning = true;

  // 1. Awali audio hening agar OS Android tidak membekukan tab ini
  initSilentAudio();

  // 2. Jalankan tick pertama segera
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((config.targetTimestamp - now) / 1000));
  const initialCountdown = formatCountdownHMS(diffSec);

  await dispatchLiveNotification(config, initialCountdown);
  updateMediaSession(config, initialCountdown);

  // 3. Pasang interval berkala (setiap 3-4 detik agar tidak boros baterai namun selalu responsif)
  if (backgroundIntervalId) {
    clearInterval(backgroundIntervalId);
  }

  backgroundIntervalId = setInterval(() => {
    processBackgroundTick().catch(() => {});
  }, 4000);

  // 4. Daftarkan event visibilitychange untuk menjamin kontinuitas
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}

/**
 * Update target sholat berikutnya saat berganti waktu atau kota
 */
export function updateBackgroundPrayer(config: Partial<BackgroundPrayerConfig>): void {
  if (!currentConfig) return;

  currentConfig = {
    ...currentConfig,
    ...config
  };

  if (isKeepAliveRunning) {
    processBackgroundTick().catch(() => {});
  }
}

/**
 * Matikan pemantauan hitung mundur dan bersihkan notifikasi HP
 */
export async function disableBackgroundCountdown(): Promise<void> {
  isKeepAliveRunning = false;
  currentConfig = null;

  if (backgroundIntervalId) {
    clearInterval(backgroundIntervalId);
    backgroundIntervalId = null;
  }

  if (keepAliveAudio) {
    try {
      keepAliveAudio.pause();
      keepAliveAudio.currentTime = 0;
    } catch {
      // ignore
    }
    keepAliveAudio = null;
  }

  if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
    try {
      // @ts-ignore
      navigator.mediaSession.metadata = null;
    } catch {
      // ignore
    }
  }

  // Tutup notifikasi di Service Worker
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({
          type: 'SET_COUNTDOWN_NOTIFICATION',
          enabled: false
        });
      }
      const notifs = await reg.getNotifications({ tag: 'prayer-countdown-live' });
      notifs.forEach(n => n.close());
    } catch {
      // ignore
    }
  }
}

/**
 * Cek apakah pemantauan background aktif
 */
export function isBackgroundCountdownActive(): boolean {
  return isKeepAliveRunning;
}

/**
 * Pastikan audio dan interval tetap berjalan saat tab diminimalkan atau dibuka kembali
 */
function handleVisibilityChange(): void {
  if (!isKeepAliveRunning || !currentConfig) return;

  if (document.visibilityState === 'hidden') {
    // Saat layar HP dimatikan atau user membuka aplikasi lain:
    // Pastikan audio tetap berputar agar Android Foreground Service aktif
    if (keepAliveAudio && keepAliveAudio.paused) {
      keepAliveAudio.play().catch(() => {});
    }
    processBackgroundTick().catch(() => {});
  } else if (document.visibilityState === 'visible') {
    // Saat user kembali membuka tab:
    processBackgroundTick().catch(() => {});
  }
}

// ==========================================
// SERVICE WORKER ALARM & BACKGROUND NOTIFICATION
// KHUSUS PWA KELUARGA BESAR KH. SUMADI
// Mengelola notifikasi latar belakang dan hitung mundur
// sholat terus-menerus meskipun aplikasi ditutup
// ==========================================

const DB_NAME = 'prayer_app_sw_db';
const DB_VERSION = 1;
const STORE_NAME = 'sw_store';

// Memori in-memory untuk akses cepat
let scheduledAgendas = [];
let scheduledPrayers = [];
let countdownNotificationConfig = null;
let isInitialized = false;

// ----------------------------------------------------
// INDEXEDDB HELPER NATIVE (Tahan Restart & App Close)
// ----------------------------------------------------
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) {
      return reject(new Error('IndexedDB not supported in SW'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function dbSet(key, value) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function dbDelete(key) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// Inisialisasi data dari IndexedDB saat Service Worker bangun
async function initFromStorage() {
  try {
    const savedCountdown = await dbGet('countdown_config');
    if (savedCountdown && savedCountdown.enabled) {
      countdownNotificationConfig = savedCountdown;
    }
    const savedPrayers = await dbGet('scheduled_prayers');
    if (Array.isArray(savedPrayers) && savedPrayers.length > 0) {
      scheduledPrayers = savedPrayers;
    }
    const savedAgendas = await dbGet('scheduled_agendas');
    if (Array.isArray(savedAgendas) && savedAgendas.length > 0) {
      scheduledAgendas = savedAgendas;
    }
    isInitialized = true;
  } catch (err) {
    console.warn('[SW] Gagal memuat state dari IndexedDB:', err);
  }
}

// ----------------------------------------------------
// SIKLUS HIDUP SERVICE WORKER
// ----------------------------------------------------
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      initFromStorage().then(() => updateCountdownNotification())
    ])
  );
});

// ----------------------------------------------------
// NOTIFIKASI WAKTU SHOLAT TIBA (ADZAN / ALARM)
// ----------------------------------------------------
function showPrayerDueNotification(prayerName, timeStr, cityName) {
  const title = `🕌 Waktu Sholat ${prayerName} - ${cityName || 'Sekitarnya'}`;
  const body = `Telah masuk waktu sholat ${prayerName} (${timeStr || ''} WIB). Mari tunaikan ibadah sholat tepat waktu.`;

  return self.registration.showNotification(title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [600, 200, 600, 200, 1000],
    tag: `prayer-due-${prayerName}-${new Date().toDateString()}`,
    requireInteraction: true,
    renotify: true,
    silent: false,
    sound: '/notification.mp3',
    data: {
      prayerName,
      url: '/?tab=dash&prayerAlarm=1',
      time: Date.now()
    },
    actions: [
      { action: 'open_prayer', title: '🕌 Buka Jadwal' },
      { action: 'dismiss', title: 'Tutup' }
    ]
  });
}

// ----------------------------------------------------
// UPDATE HITUNG MUNDUR NOTIFIKASI ONGOING DI STATUS BAR HP
// Tahan Banting: Otomatis Switch ke Sholat Berikutnya Saat Waktu Tiba!
// ----------------------------------------------------
async function updateCountdownNotification() {
  if (!countdownNotificationConfig || !countdownNotificationConfig.enabled) {
    // Coba baca dari DB jika in-memory belum terisi
    if (!isInitialized) {
      await initFromStorage();
    }
    if (!countdownNotificationConfig || !countdownNotificationConfig.enabled) {
      return;
    }
  }

  const now = Date.now();
  let diffMs = countdownNotificationConfig.targetTimestamp - now;

  // Jika waktu sholat target telah tiba atau lewat
  if (diffMs <= 0) {
    // 1. Bunyikan notifikasi adzan sholat yang tiba
    await showPrayerDueNotification(
      countdownNotificationConfig.prayerName,
      countdownNotificationConfig.timeStr,
      countdownNotificationConfig.cityName
    );

    // 2. Otomatis cari sholat fardhu berikutnya dari daftar yang tersimpan di IndexedDB
    let nextUpcoming = null;
    if (Array.isArray(countdownNotificationConfig.upcomingPrayers)) {
      nextUpcoming = countdownNotificationConfig.upcomingPrayers.find(p => p && p.timestamp > now);
    }
    if (!nextUpcoming && Array.isArray(scheduledPrayers)) {
      nextUpcoming = scheduledPrayers.find(p => p && p.timestamp > now);
    }

    if (nextUpcoming) {
      // Perbarui target ke waktu sholat berikutnya
      countdownNotificationConfig.prayerName = nextUpcoming.name;
      countdownNotificationConfig.timeStr = nextUpcoming.timeStr;
      countdownNotificationConfig.targetTimestamp = nextUpcoming.timestamp;
      diffMs = countdownNotificationConfig.targetTimestamp - now;

      // Simpan perubahan ke IndexedDB agar tetap aktif saat app ditutup
      await dbSet('countdown_config', countdownNotificationConfig);
    } else {
      // Jika tidak ada data lanjutan, perpanjang 24 jam untuk sholat yang sama besok
      countdownNotificationConfig.targetTimestamp += 24 * 60 * 60 * 1000;
      diffMs = countdownNotificationConfig.targetTimestamp - now;
      await dbSet('countdown_config', countdownNotificationConfig);
    }
  }

  if (diffMs <= 0) return;

  const diffSec = Math.floor(diffMs / 1000);
  const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const s = String(diffSec % 60).padStart(2, '0');
  const countdownText = `-${h}:${m}:${s}`;

  const title = `🕌 Menuju ${countdownNotificationConfig.prayerName} ${countdownText}`;
  const body = `Jadwal ${countdownNotificationConfig.cityName} • Sholat ${countdownNotificationConfig.prayerName} pukul ${countdownNotificationConfig.timeStr} WIB`;

  try {
    await self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'prayer-countdown-live',
      renotify: false,
      silent: true,
      ongoing: true, // Berjalan terus di status bar HP tanpa swipe hilang tidak sengaja
      requireInteraction: true,
      data: {
        url: '/?tab=dash&prayer=1',
        targetTimestamp: countdownNotificationConfig.targetTimestamp
      },
      actions: [
        { action: 'open_prayer', title: '🕌 Buka Jadwal' },
        { action: 'stop_countdown', title: 'Matikan Notif' }
      ]
    });
  } catch (err) {
    console.warn('[SW] Gagal menampilkan notifikasi countdown:', err);
  }
}

// ----------------------------------------------------
// CEK JADWAL SHOLAT & AGENDA SECARA BERKALA
// ----------------------------------------------------
function checkDuePrayers() {
  const now = Date.now();
  if (!Array.isArray(scheduledPrayers) || scheduledPrayers.length === 0) return;

  scheduledPrayers.forEach((item) => {
    if (!item || !item.timestamp) return;

    // Cek jika waktu sholat tiba (toleransi 10 menit)
    const diff = now - item.timestamp;
    const isDue = diff >= 0 && diff < 10 * 60 * 1000;

    if (isDue && !item.fired) {
      item.fired = true;
      showPrayerDueNotification(item.name, item.timeStr, item.cityName);
    }
  });
}

function checkDueAgendas() {
  const now = Date.now();
  if (!Array.isArray(scheduledAgendas) || scheduledAgendas.length === 0) return;

  scheduledAgendas.forEach((agenda) => {
    if (!agenda || !agenda.targetTimestamp) return;

    const diff = now - agenda.targetTimestamp;
    const isDue = diff >= 0 && diff < 24 * 60 * 60 * 1000;

    if (isDue && !agenda.fired) {
      agenda.fired = true;

      const title = `🔔 WAKTUNYA ACARA: ${agenda.title}!`;
      const body = `Agenda "${agenda.title}" di ${agenda.location || 'tempat acara'} telah tiba waktunya. Klik untuk membuka detail agenda keluarga!`;

      self.registration.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [500, 200, 500, 200, 800, 400, 1000],
        tag: `agenda-due-${agenda.id}`,
        requireInteraction: true,
        renotify: true,
        silent: false,
        sound: '/notification.mp3',
        data: {
          agendaId: agenda.id,
          url: '/?tab=agenda&alarm=1',
          time: now
        },
        actions: [
          { action: 'open', title: '📅 Buka Agenda' },
          { action: 'dismiss', title: 'Tutup' }
        ]
      });
    }
  });
}

// Siklus loop pembaruan background
async function backgroundTick() {
  if (!isInitialized) {
    await initFromStorage();
  }
  checkDueAgendas();
  checkDuePrayers();
  await updateCountdownNotification();
}

// Timer berkala saat Service Worker hidup
setInterval(() => {
  backgroundTick().catch(() => {});
}, 20000);

// ----------------------------------------------------
// PENERIMA PESAN DARI APLIKASI UTAMA (REACT)
// ----------------------------------------------------
self.addEventListener('message', async (event) => {
  if (!event.data) return;

  // 1. Sinkronisasi Agenda Keluarga
  if (event.data.type === 'SYNC_SCHEDULED_AGENDAS') {
    scheduledAgendas = event.data.agendas || [];
    await dbSet('scheduled_agendas', scheduledAgendas);
    checkDueAgendas();
  }

  // 2. Sinkronisasi Jadwal Sholat Harian
  if (event.data.type === 'SYNC_SCHEDULED_PRAYERS') {
    scheduledPrayers = event.data.prayers || [];
    await dbSet('scheduled_prayers', scheduledPrayers);
    checkDuePrayers();
  }

  // 3. Konfigurasi Notifikasi Hitung Mundur Terus-Menerus di Status Bar HP
  if (event.data.type === 'SET_COUNTDOWN_NOTIFICATION') {
    if (event.data.enabled && event.data.targetTimestamp) {
      countdownNotificationConfig = {
        enabled: true,
        prayerName: event.data.prayerName,
        timeStr: event.data.timeStr,
        cityName: event.data.cityName,
        targetTimestamp: event.data.targetTimestamp,
        lat: event.data.lat,
        lng: event.data.lng,
        upcomingPrayers: event.data.upcomingPrayers || []
      };

      // Simpan ke IndexedDB agar tidak hilang saat aplikasi ditutup
      await dbSet('countdown_config', countdownNotificationConfig);
      await updateCountdownNotification();
    } else {
      countdownNotificationConfig = null;
      await dbDelete('countdown_config');

      if (self.registration && self.registration.getNotifications) {
        try {
          const notifs = await self.registration.getNotifications({ tag: 'prayer-countdown-live' });
          notifs.forEach(n => n.close());
        } catch {
          // ignore
        }
      }
    }
  }

  // 4. Tes Alarm & Suara
  if (event.data.type === 'TEST_ALARM_NOTIFICATION') {
    self.registration.showNotification('🔔 Tes Suara & Notifikasi Agenda', {
      body: 'Notifikasi otomatis berfungsi! Suara dan getaran akan berbunyi saat agenda tiba meskipun aplikasi ditutup.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [400, 150, 400, 150, 600],
      sound: '/notification.mp3',
      tag: 'test-alarm',
      requireInteraction: true,
      data: { url: '/?test=1' }
    });
  }
});

// ----------------------------------------------------
// PERIODIC SYNC & BACKGROUND SYNC
// Dipicu oleh sistem operasi Android saat aplikasi di background / tertutup
// ----------------------------------------------------
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'prayer-countdown-sync' || event.tag === 'check-agenda-alarms') {
    event.waitUntil(backgroundTick());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'prayer-countdown-sync' || event.tag === 'check-agenda-alarms') {
    event.waitUntil(backgroundTick());
  }
});

// ----------------------------------------------------
// PENANGANAN KLIK NOTIFIKASI DI STATUS BAR HP
// ----------------------------------------------------
self.addEventListener('notificationclick', async (event) => {
  // Jika pengguna menekan tombol "Matikan Notif"
  if (event.action === 'stop_countdown') {
    event.notification.close();
    countdownNotificationConfig = null;
    await dbDelete('countdown_config');
    return;
  }

  if (event.action === 'dismiss') {
    event.notification.close();
    return;
  }

  event.notification.close();

  let targetUrl = '/?tab=dash&prayer=1';
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Jika ada jendela browser yang sudah terbuka, fokuskan
      for (const client of clientList) {
        if ('focus' in client) {
          if (event.notification.data?.agendaId) {
            client.postMessage({
              type: 'TRIGGER_ALARM_SOUND',
              agendaId: event.notification.data.agendaId
            });
          }
          return client.focus();
        }
      }
      // Jika tidak ada jendela terbuka, buka jendela baru
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

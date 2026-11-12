// ==========================================
// SERVICE WORKER ALARM & BACKGROUND NOTIFICATION
// KHUSUS PWA KELUARGA BESAR KH. SUMADI
// Mengelola notifikasi agenda keluarga di latar belakang
// ==========================================

const DB_NAME = 'family_app_sw_db';
const DB_VERSION = 1;
const STORE_NAME = 'sw_store';

let scheduledAgendas = [];
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

// Inisialisasi data agenda dari IndexedDB saat Service Worker bangun
async function initFromStorage() {
  try {
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
      initFromStorage(),
      // Bersihkan semua notifikasi lama jadwal sholat jika masih ada
      self.registration.getNotifications().then((notifs) => {
        notifs.forEach(n => {
          if (n.tag && (n.tag.startsWith('prayer-') || n.tag === 'prayer-countdown-live')) {
            n.close();
          }
        });
      }).catch(() => {})
    ])
  );
});

// ----------------------------------------------------
// CEK AGENDA KELUARGA SECARA BERKALA
// ----------------------------------------------------
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
}

// Timer berkala saat Service Worker hidup
setInterval(() => {
  backgroundTick().catch(() => {});
}, 30000);

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

  // 2. Tes Alarm & Suara
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
// ----------------------------------------------------
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-agenda-alarms') {
    event.waitUntil(backgroundTick());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'check-agenda-alarms') {
    event.waitUntil(backgroundTick());
  }
});

// ----------------------------------------------------
// PENANGANAN KLIK NOTIFIKASI
// ----------------------------------------------------
self.addEventListener('notificationclick', async (event) => {
  if (event.action === 'dismiss') {
    event.notification.close();
    return;
  }

  event.notification.close();

  let targetUrl = '/?tab=agenda&alarm=1';
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

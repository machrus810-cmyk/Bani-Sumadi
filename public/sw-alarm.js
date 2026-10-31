// ==========================================
// SERVICE WORKER ALARM & BACKGROUND NOTIFICATION
// KHUSUS PWA KELUARGA BESAR KH. SUMADI
// Mengelola notifikasi latar belakang saat aplikasi ditutup
// ==========================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Cache atau memori untuk daftar agenda dan jadwal sholat yang dijadwalkan
let scheduledAgendas = [];
let scheduledPrayers = [];
let countdownNotificationConfig = null;

// Fungsi untuk memperbarui notifikasi hitung mundur sholat terus menerus di status bar HP
function updateCountdownNotification() {
  if (!countdownNotificationConfig || !countdownNotificationConfig.enabled) return;
  const now = Date.now();
  const diffMs = countdownNotificationConfig.targetTimestamp - now;
  if (diffMs <= 0) return;

  const diffSec = Math.floor(diffMs / 1000);
  const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const s = String(diffSec % 60).padStart(2, '0');
  const countdownText = `-${h}:${m}:${s}`;

  self.registration.showNotification(`🕌 Menuju ${countdownNotificationConfig.prayerName} ${countdownText}`, {
    body: `Jadwal ${countdownNotificationConfig.cityName} • ${countdownNotificationConfig.prayerName} pukul ${countdownNotificationConfig.timeStr} WIB`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'prayer-countdown-live',
    renotify: false,
    silent: true,
    ongoing: true,
    requireInteraction: true,
    data: {
      url: '/?tab=dash&prayer=1',
      targetTimestamp: countdownNotificationConfig.targetTimestamp
    }
  });
}

// Fungsi untuk mengecek waktu sholat yang tiba
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

      const title = `🕌 Waktu Sholat ${item.name} - ${item.cityName || 'Sekitarnya'}`;
      const body = `Telah masuk waktu sholat ${item.name} (${item.timeStr || ''}). Mari tunaikan ibadah sholat tepat waktu.`;

      self.registration.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [600, 200, 600, 200, 1000],
        tag: `prayer-due-${item.name}-${new Date().toDateString()}`,
        requireInteraction: true,
        renotify: true,
        silent: false,
        sound: '/notification.mp3',
        data: {
          prayerName: item.name,
          url: '/?tab=dash&prayerAlarm=1',
          time: now
        },
        actions: [
          { action: 'open', title: '🕌 Buka Jadwal Sholat' },
          { action: 'dismiss', title: 'Tutup' }
        ]
      });
    }
  });
}

// Fungsi untuk mengecek agenda yang waktunya sudah tiba
function checkDueAgendas() {
  const now = Date.now();
  if (!Array.isArray(scheduledAgendas) || scheduledAgendas.length === 0) return;

  scheduledAgendas.forEach((agenda) => {
    if (!agenda || !agenda.targetTimestamp) return;

    // Jika waktu agenda sudah lewat dalam rentang toleransi (maksimal 24 jam yang lalu)
    // dan belum pernah dibunyikan notifikasinya
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

// Cek berkala setiap 20 detik saat Service Worker aktif
setInterval(() => {
  checkDueAgendas();
  checkDuePrayers();
  updateCountdownNotification();
}, 20000);

// Menerima pesan sinkronisasi agenda dan hitung mundur dari aplikasi utama
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SYNC_SCHEDULED_AGENDAS') {
    scheduledAgendas = event.data.agendas || [];
    checkDueAgendas();
  }

  if (event.data.type === 'SYNC_SCHEDULED_PRAYERS') {
    scheduledPrayers = event.data.prayers || [];
    checkDuePrayers();
  }

  // Notifikasi terus-menerus hitung mundur sholat di notifikasi HP
  if (event.data.type === 'SET_COUNTDOWN_NOTIFICATION') {
    if (event.data.enabled && event.data.targetTimestamp) {
      countdownNotificationConfig = {
        enabled: true,
        prayerName: event.data.prayerName,
        timeStr: event.data.timeStr,
        cityName: event.data.cityName,
        targetTimestamp: event.data.targetTimestamp
      };
      updateCountdownNotification();
    } else {
      countdownNotificationConfig = null;
      if (self.registration && self.registration.getNotifications) {
        self.registration.getNotifications({ tag: 'prayer-countdown-live' }).then((notifs) => {
          notifs.forEach(n => n.close());
        }).catch(() => {});
      }
    }
  }

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

// Dukungan Periodic Background Sync (saat browser / HP berada di latar belakang)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-agenda-alarms') {
    event.waitUntil(Promise.resolve(checkDueAgendas()));
  }
});

// Menangani klik pada notifikasi sistem (saat aplikasi tertutup atau di background)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/?tab=agenda&alarm=1';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Jika ada jendela aplikasi yang sudah terbuka, fokuskan dan beri tahu untuk bunyikan suara alarm
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'TRIGGER_ALARM_SOUND',
            agendaId: event.notification.data?.agendaId
          });
          return client.focus();
        }
      }
      // Jika tidak ada jendela yang terbuka, buka jendela baru
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

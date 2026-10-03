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

// Cache atau memori untuk daftar agenda yang dijadwalkan
let scheduledAgendas = [];

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

// Cek berkala setiap 30 detik saat Service Worker aktif
setInterval(checkDueAgendas, 30000);

// Menerima pesan sinkronisasi agenda dari aplikasi utama
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SYNC_SCHEDULED_AGENDAS') {
    scheduledAgendas = event.data.agendas || [];
    checkDueAgendas();
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

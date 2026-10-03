// ==========================================
// MODUL AUDIO CHIME & WEB NOTIFIKASI AGENDA
// Mendukung pemutaran audio real-time Web Audio API,
// file audio lokal, vibrasi, dan Web Notification PWA di latar belakang
// ==========================================

import type { Agenda } from './App';

let audioCtxInstance: AudioContext | null = null;
let activeOscillators: OscillatorNode[] = [];
let activeGainNodes: GainNode[] = [];
let currentAudioElement: HTMLAudioElement | null = null;
let isAlarmRinging = false;
let alarmIntervalTimer: ReturnType<typeof setInterval> | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtxInstance) {
    audioCtxInstance = new AudioCtx();
  }
  if (audioCtxInstance.state === 'suspended') {
    audioCtxInstance.resume().catch(() => {});
  }
  return audioCtxInstance;
}

// Buka kunci AudioContext dari interaksi pertama pengguna (klik/tap di layar)
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  const handleFirstInteraction = () => {
    unlockAudioContext();
    window.removeEventListener('click', handleFirstInteraction);
    window.removeEventListener('touchstart', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
  };
  window.addEventListener('click', handleFirstInteraction, { passive: true });
  window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
  window.addEventListener('keydown', handleFirstInteraction, { passive: true });
}

/**
 * Memutar melodi chime lonceng bernada indah (G4 - C5 - E5 - G5 - C6)
 * menggunakan Web Audio API murni (tanpa jeda, bekerja offline)
 * serta didukung audio file cadangan dan getaran perangkat.
 */
export async function playNotificationChime(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Getar perangkat HP jika didukung
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([400, 150, 400, 150, 800, 200, 1000]);
    } catch {
      // Abaikan jika browser membatasi vibrasi
    }
  }

  // 2. Mainkan melalui Web Audio API Synthesizer (Instant & Berkualitas Tinggi)
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;
      // Melodi lonceng bertingkat (arpeggio C-Mayor ceria dan jelas terdengar)
      const notes = [
        { freq: 392.00, time: 0.00, dur: 1.2, gain: 0.35 }, // G4
        { freq: 523.25, time: 0.18, dur: 1.4, gain: 0.40 }, // C5
        { freq: 659.25, time: 0.36, dur: 1.5, gain: 0.45 }, // E5
        { freq: 783.99, time: 0.54, dur: 1.8, gain: 0.50 }, // G5
        { freq: 1046.50, time: 0.72, dur: 2.5, gain: 0.60 }, // C6 (Puncak nada)
        { freq: 1318.51, time: 0.72, dur: 2.0, gain: 0.30 }  // E6 (Harmonik berkilau)
      ];

      notes.forEach(({ freq, time, dur, gain }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Nada sinus lembut dengan overtone lonceng
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        // Karakter lonceng (attack cepat, peluruhan panjang)
        gainNode.gain.setValueAtTime(0.0001, now + time);
        gainNode.gain.exponentialRampToValueAtTime(gain, now + time + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.1);

        activeOscillators.push(osc);
        activeGainNodes.push(gainNode);

        setTimeout(() => {
          activeOscillators = activeOscillators.filter(o => o !== osc);
          activeGainNodes = activeGainNodes.filter(g => g !== gainNode);
        }, (time + dur + 0.2) * 1000);
      });
    }
  } catch (err) {
    console.warn('Web Audio playback error:', err);
  }

  // 3. Cadangan: HTML5 Audio dari aset lokal
  try {
    if (currentAudioElement) {
      currentAudioElement.pause();
      currentAudioElement = null;
    }
    const audio = new Audio('/notification.mp3');
    audio.volume = 1.0;
    currentAudioElement = audio;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback coba notification.wav
        const audioWav = new Audio('/notification.wav');
        audioWav.volume = 1.0;
        currentAudioElement = audioWav;
        audioWav.play().catch(() => {});
      });
    }
  } catch {
    // Abaikan jika browser autoplay policy membatasi
  }
}

/**
 * Memulai dering alarm berulang (misalnya berdering setiap 3 detik)
 * sampai pengguna menekan tombol "Matikan Alarm".
 */
export function startAlarmLoop(): void {
  stopAlarmSound();
  isAlarmRinging = true;

  // Bunyikan langsung putaran pertama
  playNotificationChime();

  // Ulangi setiap 3 detik sampai dimatikan
  alarmIntervalTimer = setInterval(() => {
    if (isAlarmRinging) {
      playNotificationChime();
    } else {
      stopAlarmSound();
    }
  }, 3200);

  // Otomatis berhenti setelah 60 detik demi kenyamanan jika pengguna tidak menekan
  setTimeout(() => {
    stopAlarmSound();
  }, 60000);
}

/**
 * Menghentikan bunyi alarm yang sedang berdering
 */
export function stopAlarmSound(): void {
  isAlarmRinging = false;
  if (alarmIntervalTimer) {
    clearInterval(alarmIntervalTimer);
    alarmIntervalTimer = null;
  }
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // Abaikan
    }
    currentAudioElement = null;
  }
  try {
    activeOscillators.forEach(osc => {
      try { osc.stop(); } catch {}
    });
    activeOscillators = [];
    activeGainNodes = [];
  } catch {
    // Abaikan
  }
}

export function isAlarmPlaying(): boolean {
  return isAlarmRinging;
}

/**
 * Cek status izin notifikasi browser
 */
export function getNotificationPermissionStatus(): 'default' | 'granted' | 'denied' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Meminta izin notifikasi browser dari pengguna
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    unlockAudioContext();
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return false;
  }
}

/**
 * Cek apakah pengingat suara agenda diaktifkan di pengaturan lokal
 */
export function isAlarmSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('agenda_alarm_sound_enabled');
  return stored === null ? true : stored === 'true';
}

/**
 * Simpan pengaturan on/off pengingat suara agenda
 */
export function setAlarmSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('agenda_alarm_sound_enabled', enabled ? 'true' : 'false');
}

/**
 * Menghitung target timestamp millisecond dari Agenda
 */
export function getAgendaTargetTimestamp(agenda: { date: string; time?: string }): number {
  if (!agenda || !agenda.date) return 0;
  const parts = agenda.date.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  let hours = 8;
  let minutes = 0;
  if (agenda.time && agenda.time.includes(':')) {
    const tParts = agenda.time.split(':');
    hours = parseInt(tParts[0], 10) || 8;
    minutes = parseInt(tParts[1], 10) || 0;
  }

  const target = new Date(year, month, day, hours, minutes, 0, 0);
  return target.getTime();
}

/**
 * Sinkronisasi daftar agenda ke Service Worker agar notifikasi otomatis berbunyi
 * meskipun aplikasi sedang ditutup oleh pengguna.
 */
export async function syncAgendasToServiceWorker(agendas: Agenda[]): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const payload = agendas.map(a => ({
      id: a.id,
      title: a.title,
      location: a.location,
      date: a.date,
      time: a.time,
      targetTimestamp: getAgendaTargetTimestamp(a)
    }));

    // Simpan ke localStorage sebagai cadangan offline
    localStorage.setItem('scheduled_agendas_cache', JSON.stringify(payload));

    const reg = await navigator.serviceWorker.ready;
    if (reg) {
      if (reg.active) {
        reg.active.postMessage({
          type: 'SYNC_SCHEDULED_AGENDAS',
          agendas: payload
        });
      }

      // 1. Coba daftarkan Periodic Background Sync jika browser mendukung
      try {
        if ('periodicSync' in reg) {
          // @ts-ignore
          await reg.periodicSync.register('check-agenda-alarms', {
            minInterval: 60 * 1000 // 1 menit
          });
        }
      } catch {
        // Periodic sync butuh instalasi PWA di beberapa browser
      }

      // 2. Coba Notification Triggers API jika didukung browser (Chromium PWA)
      // Ini memungkinkan OS menjadwalkan notifikasi & alarm persis di waktu acara
      // meskipun peramban ditutup sama sekali!
      try {
        if ('Notification' in window && 'showTrigger' in Notification.prototype && Notification.permission === 'granted') {
          const now = Date.now();
          for (const item of payload) {
            if (item.targetTimestamp > now) {
              // @ts-ignore
              const trigger = new window.TimestampTrigger(item.targetTimestamp);
              await reg.showNotification(`🔔 WAKTUNYA ACARA: ${item.title}!`, {
                body: `Agenda "${item.title}" di ${item.location || 'lokasi yang ditentukan'} telah tiba waktunya. Klik untuk membuka agenda keluarga!`,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                vibrate: [500, 200, 500, 200, 800, 400, 1000],
                tag: `agenda-trigger-${item.id}`,
                showTrigger: trigger,
                requireInteraction: true,
                renotify: true,
                sound: '/notification.mp3',
                data: {
                  agendaId: item.id,
                  url: '/?tab=agenda&alarm=1'
                }
              } as any);
            }
          }
        }
      } catch (triggerErr) {
        console.warn('Notification Trigger scheduling warning:', triggerErr);
      }
    }
  } catch (err) {
    console.warn('Sync agendas to Service Worker error:', err);
  }
}

/**
 * Memunculkan notifikasi sistem dan membunyikan suara alarm ketika waktu agenda tiba
 */
export async function triggerAgendaAlarm(
  agenda: { id: number; title: string; location?: string; date: string; time?: string },
  onTriggered?: () => void
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const todayStr = new Date().toISOString().split('T')[0];
  const storageKey = `agenda_alarm_fired_${agenda.id}_${todayStr}`;
  
  // Periksa apakah alarm untuk agenda ini sudah pernah berbunyi hari ini dalam 4 jam terakhir
  const lastFired = localStorage.getItem(storageKey);
  if (lastFired) {
    const elapsed = Date.now() - parseInt(lastFired, 10);
    if (elapsed < 4 * 60 * 60 * 1000) {
      return false;
    }
  }

  // Tandai sudah dibunyikan sekarang
  localStorage.setItem(storageKey, Date.now().toString());

  // 1. Bunyikan suara alarm loop & getaran jika diaktifkan
  if (isAlarmSoundEnabled()) {
    startAlarmLoop();
  }

  if (onTriggered) {
    onTriggered();
  }

  // 2. Munculkan Notifikasi Sistem OS (berbunyi di latar belakang HP / saat aplikasi tidak dibuka)
  const timeDisplay = agenda.time ? `pukul ${agenda.time} WIB` : 'hari ini';
  const title = `🔔 WAKTUNYA ACARA: ${agenda.title}!`;
  const body = `Waktu acara "${agenda.title}" di ${agenda.location || 'tempat acara'} (${timeDisplay}) telah tiba! Klik untuk melihat detail agenda.`;

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [500, 200, 500, 200, 800, 400, 1000],
        tag: `agenda-due-${agenda.id}`,
        requireInteraction: true,
        renotify: true,
        sound: '/notification.mp3',
        data: {
          agendaId: agenda.id,
          url: '/?tab=agenda&alarm=1'
        },
        actions: [
          { action: 'open', title: '📅 Buka Agenda' },
          { action: 'dismiss', title: 'Tutup' }
        ]
      } as any);
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        vibrate: [500, 200, 500, 200, 800]
      } as any);
    }
  } catch (notifErr) {
    console.warn('System notification error:', notifErr);
  }

  return true;
}

/**
 * Uji coba suara & notifikasi alarm (digunakan oleh tombol "Tes Suara Alarm")
 */
export async function testAlarmSoundAndNotification(): Promise<{ permitted: boolean; soundPlayed: boolean }> {
  unlockAudioContext();
  let permitted = false;

  // Minta izin notifikasi jika belum
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      permitted = true;
    } else if (Notification.permission !== 'denied') {
      const res = await Notification.requestPermission();
      permitted = res === 'granted';
    }
  }

  // Bunyikan dering melodi lonceng
  await playNotificationChime();

  // Kirim notifikasi tes ke Service Worker
  try {
    if (permitted && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.active) {
        reg.active.postMessage({ type: 'TEST_ALARM_NOTIFICATION' });
      } else if (reg) {
        reg.showNotification('🔔 Tes Suara & Notifikasi Alarm Agenda', {
          body: 'Notifikasi otomatis aktif! Suara alarm dan getaran akan berbunyi saat agenda tiba meskipun aplikasi ditutup.',
          icon: '/pwa-192x192.png',
          vibrate: [400, 150, 400, 150, 600],
          sound: '/notification.mp3'
        } as any);
      }
    }
  } catch (err) {
    console.warn('Test notification warning:', err);
  }

  return { permitted, soundPlayed: true };
}

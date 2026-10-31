// ==========================================
// MODUL JADWAL WAKTU SHOLAT & NOTIFIKASI
// Menggunakan astronomi presisi (Adhan JS),
// deteksi GPS otomatis, dan alarm adhan/chime islami
// ==========================================

import { Coordinates, CalculationMethod, PrayerTimes, Madhab } from 'adhan';
import { getAudioContext, unlockAudioContext } from './audioNotification';

export interface PrayerItem {
  id: 'subuh' | 'terbit' | 'dluha' | 'dhuhur' | 'ashar' | 'maghrib' | 'isya';
  name: string;
  timeStr: string;
  dateObj: Date;
  isPassed: boolean;
  isNext: boolean;
  isCurrent: boolean;
}

export interface CityLocation {
  name: string;
  province?: string;
  lat: number;
  lng: number;
}

// Daftar nama bulan Hijriyah baku dalam bahasa Indonesia
export const HIJRI_MONTHS = [
  'Muharram',
  'Safar',
  'Rabiulawal',
  'Rabiulakhir',
  'Jumadilawal',
  'Jumadilakhir',
  'Rajab',
  'Syakban',
  'Ramadhan',
  'Syawwal',
  "Dzulqa'dah",
  'Dzulhijjah'
];

/**
 * Konversi astronomis Julian Day ke kalender Hijriyah (metode Umm al-Qura)
 * 100% deterministik tanpa ketergantungan pada locale atau ICU browser/HP.
 */
function gregorianToHijriAstronomical(date: Date, dayAdjustment = 1): { day: number; month: number; year: number } {
  const d = new Date(date);
  if (dayAdjustment !== 0) {
    d.setDate(d.getDate() + dayAdjustment);
  }
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();

  let a = 0;
  let b = 0;
  let jd = 0;

  if (m > 2) {
    a = Math.floor(y / 100);
    b = 2 - a + Math.floor(a / 4);
    jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
  } else {
    const yr = y - 1;
    const mo = m + 12;
    a = Math.floor(yr / 100);
    b = 2 - a + Math.floor(a / 4);
    jd = Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1)) + day + b - 1524.5;
  }

  const z = Math.floor(jd + 0.5);
  const l = z - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const mH = Math.floor((24 * l3) / 709);
  const dH = l3 - Math.floor((709 * mH) / 24);
  const yH = 30 * n + j - 30;

  return { day: dH, month: mH, year: yH };
}

/**
 * Konversi tanggal Masehi ke Hijriyah yang 100% konsisten di semua perangkat (Desktop & HP)
 * Menghilangkan bug ICU mobile yang merubah bulan menjadi Gregorian (misal Mei) atau era menjadi 'SM'.
 */
export function getHijriDate(date: Date = new Date()): string {
  let day = 0;
  let month = 0;
  let year = 0;

  // 1. Ekstrak nilai numerik dari calendar islamic-umalqura
  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(date);
    for (const part of parts) {
      if (part.type === 'day') day = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10);
      if (part.type === 'year') year = parseInt(part.value, 10);
    }
  } catch {
    // Abaikan jika tidak didukung
  }

  // 2. Validasi ketat: jika browser di HP tidak mendukung islamic-umalqura (misal mengembalikan tahun masehi 2026),
  // gunakan algoritma astronomis murni agar selalu akurat di HP Android/iOS
  if (!year || year < 1300 || year > 1600 || !month || month < 1 || month > 12 || !day) {
    const fallback = gregorianToHijriAstronomical(date, 1);
    day = fallback.day;
    month = fallback.month;
    year = fallback.year;
  }

  const monthName = HIJRI_MONTHS[month - 1] || 'Jumadilawal';
  return `${day} ${monthName} ${year} H`;
}

// Format tanggal Masehi Indonesia (misal: "Jumat, 31 Oktober 2026")
export function formatIndoDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch {
    return date.toLocaleDateString('id-ID');
  }
}

// Daftar kota-kota utama Indonesia (Kota Demak Jawa Tengah di urutan pertama sebagai default)
export const POPULAR_CITIES: CityLocation[] = [
  { name: 'Demak', province: 'Jawa Tengah', lat: -6.8944, lng: 110.6385 },
  { name: 'Semarang', province: 'Jawa Tengah', lat: -6.9666, lng: 110.4166 },
  { name: 'Kudus', province: 'Jawa Tengah', lat: -6.8048, lng: 110.8405 },
  { name: 'Jepara', province: 'Jawa Tengah', lat: -6.5891, lng: 110.6684 },
  { name: 'Pati', province: 'Jawa Tengah', lat: -6.7494, lng: 111.0379 },
  { name: 'Rembang', province: 'Jawa Tengah', lat: -6.7063, lng: 111.3431 },
  { name: 'Surabaya', province: 'Jawa Timur', lat: -7.2575, lng: 112.7521 },
  { name: 'Tuban', province: 'Jawa Timur', lat: -6.8966, lng: 112.0648 },
  { name: 'Lamongan', province: 'Jawa Timur', lat: -7.1282, lng: 112.4132 },
  { name: 'Gresik', province: 'Jawa Timur', lat: -7.1566, lng: 112.6555 },
  { name: 'Sidoarjo', province: 'Jawa Timur', lat: -7.4726, lng: 112.6675 },
  { name: 'Bojonegoro', province: 'Jawa Timur', lat: -7.1502, lng: 111.8817 },
  { name: 'Mojokerto', province: 'Jawa Timur', lat: -7.4705, lng: 112.4401 },
  { name: 'Malang', province: 'Jawa Timur', lat: -7.9797, lng: 112.6304 },
  { name: 'Kediri', province: 'Jawa Timur', lat: -7.8480, lng: 112.0178 },
  { name: 'Madiun', province: 'Jawa Timur', lat: -7.6298, lng: 111.5239 },
  { name: 'Surakarta (Solo)', province: 'Jawa Tengah', lat: -7.5755, lng: 110.8243 },
  { name: 'Yogyakarta', province: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695 },
  { name: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 },
  { name: 'Bandung', province: 'Jawa Barat', lat: -6.9175, lng: 107.6191 },
  { name: 'Tangerang', province: 'Banten', lat: -6.1783, lng: 106.6319 },
  { name: 'Bekasi', province: 'Jawa Barat', lat: -6.2383, lng: 106.9756 },
  { name: 'Depok', province: 'Jawa Barat', lat: -6.4025, lng: 106.7942 },
  { name: 'Bogor', province: 'Jawa Barat', lat: -6.5971, lng: 106.8060 },
  { name: 'Serang', province: 'Banten', lat: -6.1104, lng: 106.1640 },
  { name: 'Cirebon', province: 'Jawa Barat', lat: -6.7320, lng: 108.5523 },
  { name: 'Denpasar', province: 'Bali', lat: -8.6705, lng: 115.2126 },
  { name: 'Mataram', province: 'NTB', lat: -8.5833, lng: 116.1167 },
  { name: 'Banda Aceh', province: 'Aceh', lat: 5.5483, lng: 95.3238 },
  { name: 'Medan', province: 'Sumatera Utara', lat: 3.5952, lng: 98.6722 },
  { name: 'Padang', province: 'Sumatera Barat', lat: -0.9471, lng: 100.4172 },
  { name: 'Palembang', province: 'Sumatera Selatan', lat: -2.9761, lng: 104.7754 },
  { name: 'Bandar Lampung', province: 'Lampung', lat: -5.3971, lng: 105.2668 },
  { name: 'Pontianak', province: 'Kalimantan Barat', lat: -0.0263, lng: 109.3425 },
  { name: 'Banjarmasin', province: 'Kalimantan Selatan', lat: -3.3194, lng: 114.5908 },
  { name: 'Balikpapan', province: 'Kalimantan Timur', lat: -1.2379, lng: 116.8289 },
  { name: 'Samarinda', province: 'Kalimantan Timur', lat: -0.5022, lng: 117.1536 },
  { name: 'Makassar', province: 'Sulawesi Selatan', lat: -5.1477, lng: 119.4327 },
  { name: 'Manado', province: 'Sulawesi Utara', lat: 1.4748, lng: 124.8421 },
  { name: 'Jayapura', province: 'Papua', lat: -2.5916, lng: 140.6690 }
];

// Cari nama kota terdekat berdasarkan koordinat GPS
export function findNearestCity(lat: number, lng: number): CityLocation {
  let nearest = POPULAR_CITIES[0];
  let minDistance = Infinity;

  for (const city of POPULAR_CITIES) {
    const dLat = city.lat - lat;
    const dLng = city.lng - lng;
    // Euclidian distance squared untuk estimasi cepat
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDistance) {
      minDistance = dist;
      nearest = city;
    }
  }

  return nearest;
}

/**
 * Deteksi lokasi otomatis melalui IP (Tanpa memerlukan izin browser)
 * Sangat berguna saat izin GPS dibatasi atau ditolak browser.
 */
export async function detectIpLocation(): Promise<CityLocation | null> {
  if (typeof window === 'undefined') return null;

  // 1. Coba ipwho.is (sangat cepat & akurat)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://ipwho.is/', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        const matched = findNearestCity(data.latitude, data.longitude);
        const name = (data.country_code === 'ID' && data.city) ? data.city : matched.name;
        return {
          name,
          province: data.region || matched.province,
          lat: data.latitude,
          lng: data.longitude
        };
      }
    }
  } catch {
    // Abaikan dan coba penyedia cadangan
  }

  // 2. Cadangan: freeipapi.com
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://freeipapi.com/api/json', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        const matched = findNearestCity(data.latitude, data.longitude);
        const name = (data.countryCode === 'ID' && data.cityName) ? data.cityName : matched.name;
        return {
          name,
          province: data.regionName || matched.province,
          lat: data.latitude,
          lng: data.longitude
        };
      }
    }
  } catch {
    // Abaikan
  }

  return null;
}

// Format 2 digit angka
function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

// Format Date menjadi HH:mm
export function formatTimeHM(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${padZero(h)}:${padZero(m)}`;
}

// Format detik menjadi -HH:MM:SS
export function formatCountdownHMS(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `-${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

/**
 * Menghitung Jadwal Sholat Lengkap (Subuh, Terbit, Dluha, Dhuhur, Ashar, Maghrib, Isya')
 * Mengacu pada parameter Kemenag RI / Singapore (Fajr 20°, Isha 18°, +2 menit Ihtiyat)
 */
export function calculateDailyPrayerTimes(lat: number, lng: number, targetDate: Date = new Date()): {
  prayers: PrayerItem[];
  nextPrayer: PrayerItem | null;
  secondsToNext: number;
} {
  const coordinates = new Coordinates(lat, lng);
  const params = CalculationMethod.Singapore();
  params.fajrAngle = 20; // Standar Kemenag RI
  params.ishaAngle = 18; // Standar Kemenag RI
  params.madhab = Madhab.Shafi; // Madzhab Syafi'i (standar Indonesia)
  
  // Penyesuaian Ihtiyat +2 menit sesuai standar Kemenag
  params.adjustments = {
    fajr: 2,
    sunrise: -2,
    dhuhr: 2,
    asr: 2,
    maghrib: 2,
    isha: 2
  };

  const pt = new PrayerTimes(coordinates, targetDate, params);

  // Waktu Dhuha: ~20 menit setelah terbit matahari (saat matahari setinggi satu tombak)
  const dluhaDate = new Date(pt.sunrise.getTime() + 20 * 60 * 1000);

  const rawPrayers = [
    { id: 'subuh' as const, name: 'Subuh', dateObj: pt.fajr },
    { id: 'terbit' as const, name: 'Terbit', dateObj: pt.sunrise },
    { id: 'dluha' as const, name: 'Dluha', dateObj: dluhaDate },
    { id: 'dhuhur' as const, name: 'Dhuhur', dateObj: pt.dhuhr },
    { id: 'ashar' as const, name: 'Ashar', dateObj: pt.asr },
    { id: 'maghrib' as const, name: 'Maghrib', dateObj: pt.maghrib },
    { id: 'isya' as const, name: "Isya'", dateObj: pt.isha }
  ];

  const now = new Date();
  const nowMs = now.getTime();

  // Tentukan sholat mana yang berikutnya tiba
  let nextPrayerRaw: typeof rawPrayers[0] | null = null;
  let secondsToNext = 0;

  for (const p of rawPrayers) {
    if (p.dateObj.getTime() > nowMs) {
      nextPrayerRaw = p;
      secondsToNext = Math.max(0, Math.floor((p.dateObj.getTime() - nowMs) / 1000));
      break;
    }
  }

  // Jika semua waktu hari ini sudah terlewat (misal setelah Isya'), waktu berikutnya adalah Subuh besok
  if (!nextPrayerRaw) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ptTomorrow = new PrayerTimes(coordinates, tomorrow, params);
    nextPrayerRaw = { id: 'subuh' as const, name: 'Subuh', dateObj: ptTomorrow.fajr };
    secondsToNext = Math.max(0, Math.floor((ptTomorrow.fajr.getTime() - nowMs) / 1000));
  }

  // Cari yang sedang aktif (current)
  let currentPrayerId: string | null = null;
  for (let i = rawPrayers.length - 1; i >= 0; i--) {
    if (rawPrayers[i].dateObj.getTime() <= nowMs) {
      currentPrayerId = rawPrayers[i].id;
      break;
    }
  }

  const prayers: PrayerItem[] = rawPrayers.map(p => ({
    id: p.id,
    name: p.name,
    timeStr: formatTimeHM(p.dateObj),
    dateObj: p.dateObj,
    isPassed: p.dateObj.getTime() <= nowMs,
    isNext: nextPrayerRaw ? p.id === nextPrayerRaw.id : false,
    isCurrent: p.id === currentPrayerId
  }));

  const nextPrayer: PrayerItem | null = nextPrayerRaw
    ? {
        id: nextPrayerRaw.id,
        name: nextPrayerRaw.name,
        timeStr: formatTimeHM(nextPrayerRaw.dateObj),
        dateObj: nextPrayerRaw.dateObj,
        isPassed: false,
        isNext: true,
        isCurrent: false
      }
    : null;

  return { prayers, nextPrayer, secondsToNext };
}

// Penyimpanan pengaturan notifikasi di localStorage
const STORAGE_SOUND_KEY = 'bani_sumadi_prayer_sound_enabled';
const STORAGE_LOCATION_KEY = 'bani_sumadi_prayer_custom_location';

export function isPrayerSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem(STORAGE_SOUND_KEY);
  return saved !== null ? saved === 'true' : true;
}

export function setPrayerSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_SOUND_KEY, String(enabled));
}

export function getSavedLocation(): { name: string; lat: number; lng: number } | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(STORAGE_LOCATION_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function saveLocation(loc: { name: string; lat: number; lng: number }): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(loc));
}

/**
 * Audio Notifikasi Adhan / Takbir Chime Islami
 * Menggunakan Web Audio API synthesizer dengan tangga nada harmonik islami yang indah & sakral
 */
export async function playPrayerAdhanSound(): Promise<void> {
  if (typeof window === 'undefined') return;
  unlockAudioContext();

  // 1. Vibrasi ganda tanda waktu sholat
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([600, 200, 600, 200, 1000]);
    } catch {
      // ignore
    }
  }

  // 2. Putar nada melodi adhan / takbir melalui Web Audio API
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    // Melodi Takbir / Seruan Adhan (Allahu Akbar):
    // C4 - F4 - F4 - G4 - A4 - G4 - F4
    const notes = [
      { freq: 261.63, time: 0.0, dur: 0.9, gain: 0.45 },  // C4 (Al-)
      { freq: 349.23, time: 0.8, dur: 1.2, gain: 0.55 },  // F4 (-laa-)
      { freq: 392.00, time: 1.9, dur: 1.4, gain: 0.50 },  // G4 (-hu)
      { freq: 440.00, time: 3.2, dur: 1.8, gain: 0.60 },  // A4 (Ak-)
      { freq: 392.00, time: 4.8, dur: 0.8, gain: 0.45 },  // G4
      { freq: 349.23, time: 5.5, dur: 2.2, gain: 0.55 },  // F4 (-bar)
      { freq: 523.25, time: 5.5, dur: 2.5, gain: 0.25 }   // C5 overtone
    ];

    notes.forEach(({ freq, time, dur, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gainNode.gain.setValueAtTime(0.0001, now + time);
      gainNode.gain.exponentialRampToValueAtTime(gain, now + time + 0.08);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + dur + 0.1);
    });

  } catch (err) {
    console.warn('Gagal memutar audio sholat Web Audio:', err);
  }

  // Coba juga file audio jika ada di /notification.mp3
  try {
    const audio = new Audio('/notification.mp3');
    audio.volume = 0.8;
    audio.play().catch(() => {});
  } catch {
    // fallback
  }
}

/**
 * Tampilkan System Web Notification Masuk Waktu Sholat
 */
export function sendPrayerNotification(prayerName: string, cityName: string): void {
  if (typeof window === 'undefined') return;

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const title = `🕌 Waktu Sholat ${prayerName} - ${cityName}`;
      const options: NotificationOptions = {
        body: `Telah masuk waktu sholat ${prayerName} untuk wilayah ${cityName} dan sekitarnya. Mari tunaikan sholat.`,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `prayer-${prayerName}-${new Date().toDateString()}`,
        requireInteraction: true
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, options);
        }).catch(() => {
          new Notification(title, options);
        });
      } else {
        new Notification(title, options);
      }
    } catch (err) {
      console.warn('Gagal mengirim Web Notification sholat:', err);
    }
  }
}

/**
 * Sinkronisasi jadwal sholat ke Service Worker agar tetap berdering saat app di background
 */
export function syncPrayersToServiceWorker(prayers: PrayerItem[], cityName: string): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const prayerData = prayers.map(p => ({
    name: p.name,
    timeStr: p.timeStr,
    timestamp: p.dateObj.getTime(),
    cityName,
    fired: p.isPassed
  }));

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SYNC_SCHEDULED_PRAYERS',
      prayers: prayerData
    });
  } else {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) {
        reg.active.postMessage({
          type: 'SYNC_SCHEDULED_PRAYERS',
          prayers: prayerData
        });
      }
    }).catch(() => {});
  }
}

/**
 * Cek status pengaturan notifikasi hitung mundur terus menerus di HP
 */
export function isContinuousCountdownEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('prayer_persistent_countdown_enabled') === 'true';
}

/**
 * Simpan pengaturan on/off notifikasi hitung mundur terus menerus di HP
 */
export function setContinuousCountdownEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('prayer_persistent_countdown_enabled', enabled ? 'true' : 'false');
}

/**
 * Memperbarui notifikasi hitung mundur yang tampil terus di status bar HP (ongoing notification)
 */
export async function updateContinuousCountdownNotification(
  nextPrayer: PrayerItem | null,
  secondsToNext: number,
  cityName: string
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  if (!nextPrayer) {
    await clearContinuousCountdownNotification();
    return;
  }

  const countdownText = formatCountdownHMS(secondsToNext);
  const title = `🕌 Menuju ${nextPrayer.name} -${countdownText}`;
  const body = `Jadwal: ${cityName} • ${nextPrayer.name} ${nextPrayer.timeStr} WIB`;

  // 1. Tampilkan via Service Worker dengan parameter ongoing: true untuk status bar HP
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'prayer-countdown-live',
        renotify: false,
        silent: true,
        ongoing: true,
        requireInteraction: true,
        data: {
          url: '/?tab=dash&prayer=1',
          targetTimestamp: nextPrayer.dateObj.getTime()
        }
      } as any);

      // Sinkronkan data ke Service Worker agar bisa diteruskan saat aplikasi di latar belakang
      if (reg.active) {
        reg.active.postMessage({
          type: 'SET_COUNTDOWN_NOTIFICATION',
          enabled: true,
          prayerName: nextPrayer.name,
          timeStr: nextPrayer.timeStr,
          cityName,
          targetTimestamp: nextPrayer.dateObj.getTime()
        });
      }
      return;
    } catch {
      // fallback jika gagal
    }
  }

  // 2. Fallback direct Notification API
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
    // abaikan jika tidak diizinkan
  }
}

/**
 * Menutup dan menghapus notifikasi hitung mundur terus menerus dari status bar HP
 */
export async function clearContinuousCountdownNotification(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
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
      // abaikan
    }
  }
}


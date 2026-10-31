// ==========================================
// KOMPONEN JADWAL WAKTU SHOLAT MINIMALIS & ELEGAN
// Tampilan Kompak & Rapi untuk HP / Mobile & Desktop
// Fitur:
// 1. Tampilan minimalis 5 waktu sholat fardhu + Terbit & Dhuha
// 2. Hitung mundur waktu sholat real-time (jam:menit:detik)
// 3. Notifikasi terus-menerus di status bar HP (ongoing notification)
// 4. Default Kota Demak Jawa Tengah & Deteksi GPS otomatis
// ==========================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MapPin, 
  RotateCw, 
  ChevronDown, 
  Sparkles,
  Info,
  X,
  Compass,
  Volume2,
  VolumeX,
  Smartphone,
  Check,
  Navigation
} from 'lucide-react';
import { 
  calculateDailyPrayerTimes, 
  findNearestCity, 
  formatCountdownHMS, 
  POPULAR_CITIES, 
  isPrayerSoundEnabled, 
  setPrayerSoundEnabled, 
  getSavedLocation, 
  saveLocation, 
  playPrayerAdhanSound, 
  sendPrayerNotification,
  syncPrayersToServiceWorker,
  detectIpLocation,
  getHijriDate,
  formatIndoDate,
  PrayerItem,
  CityLocation,
  isContinuousCountdownEnabled,
  setContinuousCountdownEnabled,
  updateContinuousCountdownNotification,
  clearContinuousCountdownNotification,
  generateUpcomingPrayers
} from './prayerTimes';
import { requestNotificationPermission } from './audioNotification';
import {
  enableBackgroundCountdown,
  updateBackgroundPrayer,
  disableBackgroundCountdown,
  isBackgroundCountdownActive
} from './backgroundService';

interface PrayerTimesWidgetProps {
  showToast?: (m: string, t?: 'success' | 'error') => void;
}

// Kota-kota ringkas favorit dengan Kota Demak Jawa Tengah di urutan pertama
const QUICK_CITIES: CityLocation[] = [
  { name: 'Demak', province: 'Jawa Tengah', lat: -6.8944, lng: 110.6385 },
  { name: 'Semarang', province: 'Jawa Tengah', lat: -6.9666, lng: 110.4166 },
  { name: 'Kudus', province: 'Jawa Tengah', lat: -6.8048, lng: 110.8405 },
  { name: 'Jepara', province: 'Jawa Tengah', lat: -6.5891, lng: 110.6684 },
  { name: 'Tuban', province: 'Jawa Timur', lat: -6.8966, lng: 112.0648 },
  { name: 'Lamongan', province: 'Jawa Timur', lat: -7.1282, lng: 112.4132 },
  { name: 'Surabaya', province: 'Jawa Timur', lat: -7.2575, lng: 112.7521 },
  { name: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 }
];

export const PrayerTimesWidget: React.FC<PrayerTimesWidgetProps> = ({ showToast }) => {
  // Lokasi default: Kota Demak, Jawa Tengah
  const defaultCity = POPULAR_CITIES[0];

  const [currentLocation, setCurrentLocation] = useState<CityLocation>(() => {
    const saved = getSavedLocation();
    if (saved) {
      return {
        name: saved.name,
        lat: saved.lat,
        lng: saved.lng
      };
    }
    return defaultCity;
  });

  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [isGpsDenied, setIsGpsDenied] = useState(false);
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [isGpsHelpOpen, setIsGpsHelpOpen] = useState(false);
  const [isBgHelpOpen, setIsBgHelpOpen] = useState(false);
  const [searchCityQuery, setSearchCityQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => isPrayerSoundEnabled());
  const [testSoundPlaying, setTestSoundPlaying] = useState(false);
  
  // Tampilan 5 Waktu Utama (Fardhu) vs 7 Waktu Lengkap (Termasuk Terbit & Dhuha)
  const [showFullSevenTimes, setShowFullSevenTimes] = useState(false);

  // Fitur Notifikasi Terus-Menerus di HP (Ongoing Notification)
  const [isContinuousNotifOn, setIsContinuousNotifOn] = useState(() => isContinuousCountdownEnabled());

  // Modal alert saat waktu sholat masuk
  const [activeAlertPrayer, setActiveAlertPrayer] = useState<PrayerItem | null>(null);

  // Waktu real-time detik ini
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Catat waktu sholat terakhir yang sudah dibunyikan notifikasi agar tidak berulang
  const notifiedPrayersRef = useRef<Set<string>>(new Set());

  // Timer interval 1 detik untuk countdown dan jam
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Perhitungan jadwal sholat berdasarkan koordinat saat ini
  const { prayers, nextPrayer, secondsToNext } = useMemo(() => {
    return calculateDailyPrayerTimes(currentLocation.lat, currentLocation.lng, currentTime);
  }, [currentLocation, currentTime]);

  // Tanggal Hijriyah & Masehi
  const hijriText = useMemo(() => getHijriDate(currentTime), [currentTime]);
  const indoDateText = useMemo(() => formatIndoDate(currentTime), [currentTime]);

  // Waktu Terbit & Dhuha terpisah untuk info ringkas di mode 5 waktu
  const terbitPrayer = useMemo(() => prayers.find(p => p.id === 'terbit'), [prayers]);
  const dluhaPrayer = useMemo(() => prayers.find(p => p.id === 'dluha'), [prayers]);

  // 5 Waktu Sholat Fardhu Utama
  const displayPrayers = useMemo(() => {
    if (showFullSevenTimes) {
      return prayers;
    }
    return prayers.filter(p => p.id !== 'terbit' && p.id !== 'dluha');
  }, [prayers, showFullSevenTimes]);

  // Sinkronkan jadwal sholat ke Service Worker untuk notifikasi latar belakang
  useEffect(() => {
    if (prayers.length > 0) {
      syncPrayersToServiceWorker(prayers, currentLocation.name, currentLocation.lat, currentLocation.lng);
    }
  }, [prayers, currentLocation.name, currentLocation.lat, currentLocation.lng]);

  // Sinkronkan pembaruan target sholat ke Background Service & Service Worker
  useEffect(() => {
    if (!isContinuousNotifOn) {
      if (isBackgroundCountdownActive()) {
        disableBackgroundCountdown();
      }
      clearContinuousCountdownNotification();
      return;
    }

    if (nextPrayer) {
      const upcoming = generateUpcomingPrayers(currentLocation.lat, currentLocation.lng, 7);

      if (!isBackgroundCountdownActive()) {
        enableBackgroundCountdown({
          prayerName: nextPrayer.name,
          timeStr: nextPrayer.timeStr,
          cityName: currentLocation.name,
          targetTimestamp: nextPrayer.dateObj.getTime(),
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          upcomingPrayers: upcoming
        });
      } else {
        updateBackgroundPrayer({
          prayerName: nextPrayer.name,
          timeStr: nextPrayer.timeStr,
          cityName: currentLocation.name,
          targetTimestamp: nextPrayer.dateObj.getTime(),
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          upcomingPrayers: upcoming
        });
      }

      updateContinuousCountdownNotification(
        nextPrayer, 
        secondsToNext, 
        currentLocation.name, 
        currentLocation.lat, 
        currentLocation.lng
      );
    }
  }, [isContinuousNotifOn, nextPrayer?.id, nextPrayer?.timeStr, currentLocation.name, currentLocation.lat, currentLocation.lng]);

  // Pantau apakah ada waktu sholat yang tepat masuk (toleransi 50 detik)
  useEffect(() => {
    const nowMs = currentTime.getTime();
    const todayKey = currentTime.toDateString();

    prayers.forEach(prayer => {
      if (prayer.id === 'terbit') return;

      const diffSec = Math.floor((nowMs - prayer.dateObj.getTime()) / 1000);
      const uniqueNotifKey = `${todayKey}-${prayer.id}`;

      if (diffSec >= 0 && diffSec <= 50 && !notifiedPrayersRef.current.has(uniqueNotifKey)) {
        notifiedPrayersRef.current.add(uniqueNotifKey);

        if (soundEnabled) {
          playPrayerAdhanSound();
        }

        sendPrayerNotification(prayer.name, currentLocation.name);
        setActiveAlertPrayer(prayer);

        if (showToast) {
          showToast(`🕌 Masuk Waktu Sholat ${prayer.name} untuk wilayah ${currentLocation.name}`, 'success');
        }
      }
    });
  }, [currentTime, prayers, soundEnabled, currentLocation.name, showToast]);

  // Deteksi GPS dengan Fallback IP yang mulus
  const detectGpsLocation = async (isManualTrigger = false) => {
    setIsGpsLoading(true);

    if (!navigator.geolocation) {
      fallbackToIpDetection(isManualTrigger);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let matchedCity = findNearestCity(latitude, longitude);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=id`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            const detectedName = data.city || data.locality || data.principalSubdivision || matchedCity.name;
            if (detectedName) {
              matchedCity = {
                name: detectedName,
                province: data.principalSubdivision || matchedCity.province,
                lat: latitude,
                lng: longitude
              };
            }
          }
        } catch {
          // Pakai matchedCity
        }

        setCurrentLocation({
          name: matchedCity.name,
          province: matchedCity.province,
          lat: latitude,
          lng: longitude
        });

        saveLocation({
          name: matchedCity.name,
          lat: latitude,
          lng: longitude
        });

        setIsGpsDenied(false);
        setIsGpsLoading(false);

        if (isManualTrigger && showToast) {
          showToast(`📍 Lokasi GPS diperbarui: ${matchedCity.name}`, 'success');
        }
      },
      async () => {
        setIsGpsDenied(true);
        await fallbackToIpDetection(isManualTrigger);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  };

  // Fallback ke Deteksi IP
  const fallbackToIpDetection = async (isManualTrigger: boolean) => {
    try {
      const ipLoc = await detectIpLocation();
      setIsGpsLoading(false);

      if (ipLoc) {
        setCurrentLocation(ipLoc);
        saveLocation({
          name: ipLoc.name,
          lat: ipLoc.lat,
          lng: ipLoc.lng
        });

        if (isManualTrigger && showToast) {
          showToast(`📍 Terdeteksi otomatis: ${ipLoc.name}`, 'success');
        }
        return;
      }
    } catch {
      // Abaikan
    }

    setIsGpsLoading(false);
    if (isManualTrigger) {
      setIsGpsHelpOpen(true);
    }
  };

  // Toggle suara adhan/alarm
  const handleToggleSound = async () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    setPrayerSoundEnabled(nextState);

    if (nextState) {
      await requestNotificationPermission();
      if (showToast) showToast('🔔 Suara adzan waktu sholat diaktifkan', 'success');
    } else {
      if (showToast) showToast('🔕 Suara adzan waktu sholat dibisukan', 'success');
    }
  };

  // Toggle Notifikasi Terus-menerus di Status Bar HP dengan Audio Keep-Alive Foreground Service
  const handleToggleContinuousNotification = async () => {
    if (!isContinuousNotifOn) {
      // 1. Coba minta izin notifikasi terlebih dahulu
      const granted = await requestNotificationPermission();
      if (!granted && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        if (showToast) {
          showToast('Izin notifikasi diblokir di browser HP. Izinkan notifikasi pada setelan situs browser.', 'error');
        }
        return;
      }

      setIsContinuousNotifOn(true);
      setContinuousCountdownEnabled(true);

      if (nextPrayer) {
        const upcoming = generateUpcomingPrayers(currentLocation.lat, currentLocation.lng, 7);
        await enableBackgroundCountdown({
          prayerName: nextPrayer.name,
          timeStr: nextPrayer.timeStr,
          cityName: currentLocation.name,
          targetTimestamp: nextPrayer.dateObj.getTime(),
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          upcomingPrayers: upcoming
        });
        await updateContinuousCountdownNotification(
          nextPrayer, 
          secondsToNext, 
          currentLocation.name,
          currentLocation.lat,
          currentLocation.lng
        );
      }

      if (showToast) {
        showToast('📱 Hitung mundur aktif di status bar HP & berjalan terus saat aplikasi ditutup!', 'success');
      }
    } else {
      setIsContinuousNotifOn(false);
      setContinuousCountdownEnabled(false);
      await disableBackgroundCountdown();
      await clearContinuousCountdownNotification();
      if (showToast) {
        showToast('📱 Notifikasi hitung mundur di HP dinonaktifkan', 'success');
      }
    }
  };

  // Uji bunyi suara adhan / takbir
  const handleTestSound = async () => {
    setTestSoundPlaying(true);
    await playPrayerAdhanSound();
    if (showToast) {
      showToast('🔊 Memutar nada seruan adzan...', 'success');
    }
    setTimeout(() => {
      setTestSoundPlaying(false);
    }, 4500);
  };

  // Pilih kota secara manual
  const handleSelectCity = (city: CityLocation) => {
    setCurrentLocation(city);
    saveLocation({
      name: city.name,
      lat: city.lat,
      lng: city.lng
    });
    setIsGpsDenied(false);
    setIsCityModalOpen(false);
    setIsGpsHelpOpen(false);
    if (showToast) {
      showToast(`📍 Jadwal sholat: ${city.name}, ${city.province || 'Jawa Tengah'}`, 'success');
    }
  };

  const filteredCities = useMemo(() => {
    if (!searchCityQuery.trim()) return POPULAR_CITIES;
    const q = searchCityQuery.toLowerCase();
    return POPULAR_CITIES.filter(
      c => c.name.toLowerCase().includes(q) || (c.province && c.province.toLowerCase().includes(q))
    );
  }, [searchCityQuery]);

  return (
    <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-[#173059] via-[#1c3a6b] to-[#162e54] text-white shadow-xl border border-amber-400/25 p-2.5 sm:p-4 select-none transition-all duration-200">
      {/* Subtle radial glow */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 10% 50%, rgba(245, 158, 11, 0.25) 0%, transparent 50%), radial-gradient(circle at 90% 50%, rgba(16, 185, 129, 0.2) 0%, transparent 50%)`
        }}
      />

      {/* ====================================================
          BARIS 1: HEADER MINIMALIS DENGAN HITUNG MUNDUR RAPI
          (Sesuai referensi gambar: Logo Masjid, Nama Kota, Menuju Subuh -07:32:12)
          ==================================================== */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        {/* SISI KIRI: Lambang Masjid & Lokasi Kota */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Ikon Masjid Squircle Hijau-Emas */}
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-teal-800/80 border border-teal-400/30 flex items-center justify-center shrink-0 shadow-xs">
            <span className="text-sm sm:text-base leading-none">🕌</span>
          </div>

          <div className="min-w-0">
            {/* Tombol Nama Kota: Klik untuk ganti kota */}
            <button
              onClick={() => setIsCityModalOpen(true)}
              className="flex items-center gap-1 text-left text-xs sm:text-sm font-black hover:text-amber-200 transition-colors group cursor-pointer"
              title="Klik untuk memilih kota atau deteksi GPS"
            >
              <span className="text-gray-200 font-bold whitespace-nowrap">Jadwal Sholat:</span>
              <span className="text-amber-400 group-hover:underline truncate max-w-[120px] sm:max-w-none">
                {currentLocation.name}
              </span>
              <MapPin size={13} className="text-amber-400 shrink-0" />
            </button>

            {/* Tanggal Hijriyah Ringkas */}
            <div className="flex items-center gap-1.5 text-[10px] text-blue-200/80 leading-tight">
              <span>{hijriText || indoDateText}</span>
              <span className="opacity-50">•</span>
              <button 
                onClick={() => detectGpsLocation(true)}
                disabled={isGpsLoading}
                className="hover:text-amber-300 transition flex items-center gap-0.5 cursor-pointer text-teal-300 font-semibold"
                title="Deteksi posisi GPS saat ini"
              >
                <RotateCw size={9} className={isGpsLoading ? 'animate-spin' : ''} />
                <span>GPS</span>
              </button>
            </div>
          </div>
        </div>

        {/* SISI KANAN: HITUNG MUNDUR (KOTAK GELAP BERCAHAYA SESUAI SCREENSHOT) & KONTROL HP */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {nextPrayer && (
            <div 
              className="bg-[#0b1626]/85 border border-slate-700/70 hover:border-amber-400/40 px-2.5 py-1 sm:px-3 sm:py-1 rounded-xl shadow-inner flex items-center gap-2 transition"
              title={`Waktu sholat berikutnya: ${nextPrayer.name} (${nextPrayer.timeStr} WIB)`}
            >
              {/* Glowing Pulse Dot Kuning */}
              <div className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]"></span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5 text-right">
                <span className="text-[9.5px] sm:text-[11px] font-bold text-gray-200 uppercase tracking-wider whitespace-nowrap">
                  Menuju {nextPrayer.name}
                </span>
                <span className="text-xs sm:text-sm font-mono font-black text-amber-400 tracking-wider tabular-nums leading-none">
                  -{formatCountdownHMS(secondsToNext)}
                </span>
              </div>
            </div>
          )}

          {/* Tombol Notifikasi Status Bar HP (Ongoing Notification) */}
          <button
            onClick={handleToggleContinuousNotification}
            className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 ${
              isContinuousNotifOn
                ? 'bg-amber-400 text-amber-950 border-amber-300 shadow-md shadow-amber-400/25 font-bold'
                : 'bg-white/10 border-white/15 text-gray-300 hover:bg-white/20'
            }`}
            title={
              isContinuousNotifOn
                ? 'Hitung Mundur di Notifikasi HP: AKTIF (Tampil terus di status bar HP). Klik untuk mematikan.'
                : 'Tampilkan Hitung Mundur Terus-menerus di Notifikasi HP (Klik untuk mengaktifkan)'
            }
          >
            <Smartphone size={14} className={isContinuousNotifOn ? 'animate-pulse' : ''} />
            <span className="hidden md:inline text-[10px] font-bold">
              {isContinuousNotifOn ? 'Notif HP ON' : 'Notif HP'}
            </span>
          </button>

          {/* Tombol Suara Adzan */}
          <button
            onClick={handleToggleSound}
            className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center active:scale-95 ${
              soundEnabled
                ? 'bg-teal-500/25 text-teal-300 border-teal-400/50'
                : 'bg-white/10 border-white/15 text-gray-400 hover:bg-white/20'
            }`}
            title={soundEnabled ? 'Suara adzan aktif' : 'Suara adzan dibisukan'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>
      </div>

      {/* ====================================================
          BARIS 2: UBIN WAKTU SHOLAT DALAM 1 BARIS HORIZONTAL RAPI
          (Sesuai screenshot: Subuh, Dzuhur, Ashar, Maghrib, Isya)
          ==================================================== */}
      <div className="relative z-10 pt-2.5">
        <div className={`grid gap-1.5 sm:gap-2 ${showFullSevenTimes ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-5'}`}>
          {displayPrayers.map((prayer) => {
            const isHighlighted = prayer.isNext;

            return (
              <div
                key={prayer.id}
                className={`flex flex-col items-center justify-center py-1.5 px-0.5 sm:py-2 sm:px-2 rounded-xl transition-all duration-150 ${
                  isHighlighted
                    ? 'bg-[#ffdc33] text-slate-950 font-black shadow-lg shadow-amber-500/25 border border-amber-300 transform scale-[1.02]'
                    : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/10 backdrop-blur-xs'
                }`}
              >
                {/* Nama Waktu Sholat */}
                <span 
                  className={`text-[10.5px] sm:text-xs tracking-tight capitalize ${
                    isHighlighted ? 'font-black text-slate-950' : 'font-semibold text-gray-200'
                  }`}
                >
                  {prayer.name}
                </span>

                {/* Jam:Menit Sholat */}
                <span 
                  className={`text-xs sm:text-sm font-bold tracking-tight mt-0.5 tabular-nums ${
                    isHighlighted ? 'font-black text-slate-950' : 'text-white'
                  }`}
                >
                  {prayer.timeStr}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ====================================================
          BARIS 3: FOOTER RINGKAS (Info Terbit/Dhuha, Toggle 5/7 Waktu, Uji Suara)
          ==================================================== */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-white/10 text-[10px] text-blue-100/70">
        {/* Info Terbit & Dhuha saat mode 5 waktu aktif */}
        {!showFullSevenTimes && terbitPrayer && dluhaPrayer && (
          <div className="flex items-center gap-2">
            <span>☀️ Terbit: <strong className="text-amber-300">{terbitPrayer.timeStr}</strong></span>
            <span className="opacity-40">•</span>
            <span>⛅ Dhuha: <strong className="text-amber-300">{dluhaPrayer.timeStr}</strong></span>
          </div>
        )}

        {/* Tombol Opsi Ringkas */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Panduan background HP */}
          <button
            onClick={() => setIsBgHelpOpen(true)}
            className="hover:text-amber-300 transition text-[10px] flex items-center gap-0.5 cursor-pointer text-blue-200/90 hover:underline"
            title="Panduan agar notifikasi hitung mundur tidak berhenti saat aplikasi ditutup di HP"
          >
            <Info size={11} className="text-amber-400" />
            <span>Info HP Tertutup</span>
          </button>

          <span className="opacity-40">•</span>

          {/* Toggle 5 vs 7 waktu sholat */}
          <button
            onClick={() => setShowFullSevenTimes(!showFullSevenTimes)}
            className="hover:text-amber-300 transition text-[10px] underline cursor-pointer"
          >
            {showFullSevenTimes ? 'Tampilkan 5 Waktu' : 'Lihat 7 Waktu (+Terbit/Dhuha)'}
          </button>

          <span className="opacity-40">•</span>

          {/* Uji nada seruan adzan */}
          <button
            onClick={handleTestSound}
            disabled={testSoundPlaying}
            className="hover:text-amber-300 transition text-[10px] flex items-center gap-0.5 cursor-pointer text-amber-300/90 font-medium"
            title="Dengarkan contoh nada adzan"
          >
            <Volume2 size={11} className={testSoundPlaying ? 'animate-pulse text-amber-300' : ''} />
            <span>{testSoundPlaying ? 'Memutar...' : 'Uji Suara'}</span>
          </button>
        </div>
      </div>

      {/* ====================================================
          MODAL PILIH KOTA & GPS
          ==================================================== */}
      {isCityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-400/40 w-full max-w-md rounded-2xl p-4 sm:p-5 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="text-amber-400" size={17} />
                <h3 className="font-bold text-sm sm:text-base text-gray-100">Pilih Kota Jadwal Sholat</h3>
              </div>
              <button
                onClick={() => setIsCityModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tombol Deteksi GPS Otomatis */}
            <div className="my-2.5">
              <button
                onClick={() => {
                  detectGpsLocation(true);
                  setIsCityModalOpen(false);
                }}
                disabled={isGpsLoading}
                className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-2 px-3.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition active:scale-[0.98] cursor-pointer text-xs sm:text-sm"
              >
                <Navigation size={15} className={isGpsLoading ? 'animate-spin' : ''} />
                <span>Gunakan Lokasi GPS Saya Saat Ini</span>
              </button>
            </div>

            {/* Input Pencarian Kota */}
            <div className="relative mb-2.5">
              <input
                type="text"
                placeholder="Cari kota (Demak, Semarang, Kudus, Surabaya, Jakarta...)"
                value={searchCityQuery}
                onChange={e => setSearchCityQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-hidden focus:border-amber-400"
              />
            </div>

            {/* Daftar Kota Favorit Cepat */}
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {filteredCities.map((city) => {
                const isSelected = city.name.toLowerCase() === currentLocation.name.toLowerCase();
                const isDemak = city.name === 'Demak';

                return (
                  <button
                    key={`${city.name}-${city.lat}`}
                    onClick={() => handleSelectCity(city)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-amber-400/25 border border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-gray-200'
                    }`}
                  >
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>{city.name}</span>
                        {isDemak && (
                          <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1 py-0.2 rounded font-bold">
                            Default
                          </span>
                        )}
                      </div>
                      {city.province && <div className="text-[10px] text-gray-400">{city.province}</div>}
                    </div>
                    {isSelected && <Check size={14} className="text-amber-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL PANDUAN IZIN GPS
          ==================================================== */}
      {isGpsHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-400/40 w-full max-w-sm rounded-2xl p-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <Compass className="text-amber-400" size={17} />
                <h3 className="font-bold text-sm text-gray-100">Info Lokasi GPS</h3>
              </div>
              <button onClick={() => setIsGpsHelpOpen(false)} className="text-gray-400 hover:text-white">
                <X size={17} />
              </button>
            </div>
            <p className="text-xs text-gray-300 my-2 leading-relaxed">
              Jadwal sholat menggunakan default <strong>Kota Demak, Jawa Tengah</strong>. Untuk menggunakan koordinat GPS Anda, izinkan akses lokasi pada browser HP.
            </p>
            <button
              onClick={() => setIsGpsHelpOpen(false)}
              className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold py-2 rounded-xl text-xs cursor-pointer mt-1"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL PANDUAN NOTIFIKASI SAAT APLIKASI DITUTUP
          ==================================================== */}
      {isBgHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-400/40 w-full max-w-sm rounded-2xl p-4 text-white shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <Smartphone className="text-amber-400" size={17} />
                <h3 className="font-bold text-sm text-gray-100">Tips Notifikasi HP Tetap Aktif</h3>
              </div>
              <button onClick={() => setIsBgHelpOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                <X size={17} />
              </button>
            </div>
            
            <div className="text-xs text-gray-300 my-3 space-y-2.5 leading-relaxed max-h-[75vh] overflow-y-auto pr-1">
              <div className="p-2.5 rounded-xl bg-teal-950/60 border border-teal-500/40 text-teal-200 text-[11.5px]">
                <strong className="text-teal-300 block mb-1">⚡ Mesin Latar Belakang Aktif:</strong>
                Fitur ini kini dilengkapi <em>Audio Keep-Alive</em> dan <em>Service Worker</em> agar hitung mundur tetap aktif dan alarm adzan tetap berbunyi saat layar HP terkunci atau saat Anda membuka aplikasi lain (WhatsApp, dll).
              </div>

              <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700/70 space-y-2.5">
                <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <Smartphone size={14} className="text-amber-400" />
                  <span>Agar Tidak Dimatikan Sistem HP (Android):</span>
                </div>
                
                <div className="flex items-start gap-2 text-[11px]">
                  <span className="font-bold text-teal-400 bg-teal-400/20 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <span><strong>Jangan Geser Hapus:</strong> Jangan swipe/tutup paksa tab aplikasi dari daftar aplikasi terakhir (Recent Apps), cukup tekan tombol <em>Home</em> saat keluar.</span>
                </div>

                <div className="flex items-start gap-2 text-[11px]">
                  <span className="font-bold text-teal-400 bg-teal-400/20 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <span><strong>Penghemat Baterai:</strong> Buka <em>Setelan HP &gt; Aplikasi &gt; Chrome/Browser &gt; Baterai</em> &gt; pilih <strong>"Tidak Dibatasi / No Restrictions"</strong> agar HP tidak mematikan timer sholat.</span>
                </div>

                <div className="flex items-start gap-2 text-[11px]">
                  <span className="font-bold text-teal-400 bg-teal-400/20 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <span><strong>Kunci Aplikasi (Opsional):</strong> Pada HP Xiaomi, Oppo, Vivo, tahan ikon aplikasi di Recent Apps lalu pilih <em>Kunci (Gembok)</em> agar tidak terhapus saat membersihkan RAM.</span>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={async () => {
                    const granted = await requestNotificationPermission();
                    if (granted) {
                      if (nextPrayer) {
                        const upcoming = generateUpcomingPrayers(currentLocation.lat, currentLocation.lng, 7);
                        await enableBackgroundCountdown({
                          prayerName: nextPrayer.name,
                          timeStr: nextPrayer.timeStr,
                          cityName: currentLocation.name,
                          targetTimestamp: nextPrayer.dateObj.getTime(),
                          lat: currentLocation.lat,
                          lng: currentLocation.lng,
                          upcomingPrayers: upcoming
                        });
                        setIsContinuousNotifOn(true);
                        setContinuousCountdownEnabled(true);
                      }
                      if (showToast) {
                        showToast('✅ Notifikasi hitung mundur telah diperbarui di status bar HP Anda!', 'success');
                      }
                    } else if (showToast) {
                      showToast('Izin notifikasi belum diberikan di browser HP.', 'error');
                    }
                  }}
                  className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles size={14} className="text-amber-300" />
                  <span>Kirim Notifikasi HP Sekarang</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setIsBgHelpOpen(false)}
              className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold py-2 rounded-xl text-xs cursor-pointer"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL NOTIFIKASI MASUK WAKTU SHOLAT
          ==================================================== */}
      {activeAlertPrayer && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 border-2 border-amber-400 w-full max-w-sm rounded-3xl p-5 text-white text-center shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mx-auto mb-2.5 shadow-lg shadow-amber-400/25 animate-bounce">
              <Sparkles size={24} className="text-amber-300" />
            </div>

            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
              Panggilan Sholat Fardhu
            </span>

            <h3 className="text-xl font-black text-amber-300 mt-0.5">
              Masuk Waktu {activeAlertPrayer.name}
            </h3>

            <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
              Telah tiba waktu sholat <strong className="text-white">{activeAlertPrayer.name} ({activeAlertPrayer.timeStr} WIB)</strong> untuk wilayah <strong className="text-amber-300">{currentLocation.name}</strong> dan sekitarnya.
            </p>

            <button
              onClick={() => setActiveAlertPrayer(null)}
              className="mt-4 w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-amber-950 font-black py-2 px-4 rounded-xl shadow-lg transition active:scale-[0.98] cursor-pointer text-xs"
            >
              Alhamdulillah, Siap Tunaikan Sholat
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

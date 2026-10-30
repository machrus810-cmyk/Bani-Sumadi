// ==========================================
// KOMPONEN JADWAL WAKTU SHOLAT MODERN & ELEGAN
// Default: Kota Demak, Jawa Tengah
// Menampilkan 7 Waktu: Subuh, Terbit, Dluha, Dhuhur, Ashar, Maghrib, Isya'
// Desain UI mewah bernuansa arsitektur Islami modern
// ==========================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MapPin, 
  Navigation, 
  Bell, 
  BellOff, 
  Volume2, 
  Check, 
  RotateCw, 
  ChevronDown, 
  Sparkles,
  Info,
  X,
  Compass,
  Calendar as CalendarIcon,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  CloudSun,
  CheckCircle2
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
  CityLocation
} from './prayerTimes';
import { requestNotificationPermission } from './audioNotification';

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

// Helper ikon astronomi untuk masing-masing waktu sholat
function getPrayerIcon(id: string, isNext: boolean) {
  const iconClass = isNext ? "text-amber-950" : "text-amber-300";
  const size = 18;

  switch (id) {
    case 'subuh':
      return <Moon size={size} className={iconClass} />;
    case 'terbit':
      return <Sunrise size={size} className={iconClass} />;
    case 'dluha':
      return <CloudSun size={size} className={iconClass} />;
    case 'dhuhur':
      return <Sun size={size} className={iconClass} />;
    case 'ashar':
      return <CloudSun size={size} className={iconClass} />;
    case 'maghrib':
      return <Sunset size={size} className={iconClass} />;
    case 'isya':
      return <Moon size={size} className={iconClass} />;
    default:
      return <Sun size={size} className={iconClass} />;
  }
}

export const PrayerTimesWidget: React.FC<PrayerTimesWidgetProps> = ({ showToast }) => {
  // Lokasi default: Kota Demak, Jawa Tengah
  const defaultCity = POPULAR_CITIES[0]; // Demak

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

  const [locationSource, setLocationSource] = useState<'gps' | 'ip' | 'manual' | 'default'>(() => {
    return getSavedLocation() ? 'manual' : 'default';
  });

  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [isGpsDenied, setIsGpsDenied] = useState(false);
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [isGpsHelpOpen, setIsGpsHelpOpen] = useState(false);
  const [searchCityQuery, setSearchCityQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => isPrayerSoundEnabled());
  const [testSoundPlaying, setTestSoundPlaying] = useState(false);

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

  // Sinkronkan jadwal sholat ke Service Worker untuk notifikasi latar belakang
  useEffect(() => {
    if (prayers.length > 0) {
      syncPrayersToServiceWorker(prayers, currentLocation.name);
    }
  }, [prayers, currentLocation.name]);

  // Pantau apakah ada waktu sholat yang tepat masuk (toleransi 60 detik)
  useEffect(() => {
    const nowMs = currentTime.getTime();
    const todayKey = currentTime.toDateString();

    prayers.forEach(prayer => {
      // Kecualikan waktu terbit untuk adhan sholat
      if (prayer.id === 'terbit') return;

      const diffSec = Math.floor((nowMs - prayer.dateObj.getTime()) / 1000);
      const uniqueNotifKey = `${todayKey}-${prayer.id}`;

      // Jika waktu sholat baru saja tiba (antara 0 sampai 50 detik setelah waktu masuk)
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

        setLocationSource('gps');
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
        setLocationSource('ip');

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
      if (showToast) showToast('🔔 Notifikasi & alarm adzan sholat diaktifkan', 'success');
    } else {
      if (showToast) showToast('🔕 Notifikasi suara sholat dinonaktifkan', 'success');
    }
  };

  // Uji bunyi suara adhan / takbir
  const handleTestSound = async () => {
    setTestSoundPlaying(true);
    await playPrayerAdhanSound();
    if (showToast) {
      showToast('🔊 Memutar nada seruan adhan...', 'success');
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
    setLocationSource('manual');
    setIsGpsDenied(false);
    setIsCityModalOpen(false);
    setIsGpsHelpOpen(false);
    if (showToast) {
      showToast(`📍 Lokasi jadwal sholat: ${city.name}, ${city.province || 'Jawa Tengah'}`, 'success');
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
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c2340] via-[#12305a] to-[#0a192f] text-white shadow-2xl border-2 border-amber-400/35 ring-1 ring-amber-400/20 p-4 sm:p-6 select-none transition-all duration-300">
      {/* 1. ORNAMEN WATERMARK ISLAMIC GIRIH & RADIAL GLOW */}
      <div 
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.4) 0%, transparent 60%), radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.3) 0%, transparent 50%)`
        }}
      />
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-96 h-28 bg-amber-400/10 blur-3xl pointer-events-none rounded-full" />

      {/* 2. HEADER: LOGO MASJID, NAMA KOTA DEMAK, TANGGAL HIJRIYAH, & HITUNGAN MUNDUR */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-amber-400/20">
        {/* Kolom Kiri: Lambang Masjid Agung & Informasi Lokasi */}
        <div className="flex items-start gap-3.5">
          {/* Mosque Insignia Tile */}
          <div className="relative shrink-0 mt-0.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/30 via-emerald-500/20 to-teal-900/50 border border-amber-400/50 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <svg 
                className="w-7 h-7 text-amber-300 filter drop-shadow" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                {/* Desain Siluet Masjid Agung Demak / Modern */}
                <path d="M12 2C11.5 2 11 2.5 11 3C11 3.2 11.1 3.4 11.2 3.5L10 4.7C8.5 6.2 7 8 7 10V11H17V10C17 8 15.5 6.2 14 4.7L12.8 3.5C12.9 3.4 13 3.2 13 3C13 2.5 12.5 2 12 2Z" />
                <path d="M4 8H6V19H4V8ZM18 8H20V19H18V8Z" />
                <path d="M7 12H17V21H14V16C14 14.9 13.1 14 12 14C10.9 14 10 14.9 10 16V21H7V12Z" />
                <path d="M2 20H22V22H2V20Z" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            </div>
          </div>

          {/* Judul & Pemilih Kota */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-widest text-amber-300/90 flex items-center gap-1">
                <Sparkles size={12} className="text-amber-400" />
                Jadwal Sholat Digital
              </span>
              {locationSource === 'default' && (
                <span className="text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.2 rounded-full font-bold">
                  Wilayah Utama
                </span>
              )}
            </div>

            {/* Tombol Nama Kota yang Menarik & Menonjol */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setIsCityModalOpen(true)}
                className="group flex items-center gap-1.5 bg-gradient-to-r from-amber-400/20 via-amber-300/15 to-transparent hover:from-amber-400/30 px-3 py-1 rounded-xl border border-amber-400/40 hover:border-amber-400 text-left transition-all cursor-pointer shadow-sm"
                title="Klik untuk memilih kota atau perbarui lokasi GPS"
              >
                <MapPin size={15} className="text-amber-400 group-hover:scale-125 transition-transform" />
                <span className="text-base sm:text-lg font-black text-amber-300 group-hover:text-amber-200">
                  {currentLocation.name}
                </span>
                <span className="text-xs font-semibold text-gray-300">
                  {currentLocation.province || 'Jawa Tengah'}
                </span>
                <ChevronDown size={14} className="text-amber-300/70 group-hover:translate-y-0.5 transition-transform ml-0.5" />
              </button>

              {/* Tombol GPS Real-time */}
              <button
                onClick={() => detectGpsLocation(true)}
                disabled={isGpsLoading}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-blue-200 hover:text-white border border-white/15 transition disabled:opacity-50 cursor-pointer"
                title="Deteksi ulang posisi GPS perangkat Anda"
              >
                <RotateCw size={14} className={isGpsLoading ? 'animate-spin text-amber-300' : ''} />
              </button>
            </div>

            {/* Tanggal Hijriyah & Masehi */}
            <div className="flex items-center gap-2 text-[11px] text-blue-100/80 flex-wrap pt-0.5">
              <span className="flex items-center gap-1 font-medium">
                <CalendarIcon size={12} className="text-amber-300" />
                {indoDateText}
              </span>
              {hijriText && (
                <>
                  <span className="text-amber-400/60">•</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-200/90">
                    <Moon size={11} className="text-amber-300" />
                    {hijriText}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Countdown Mewah & Kontrol Suara */}
        <div className="flex items-center gap-3 self-start md:self-center ml-auto">
          {nextPrayer && (
            <div className="bg-gradient-to-b from-black/50 to-black/70 backdrop-blur-md border border-amber-400/35 px-4 py-2 rounded-2xl shadow-inner flex flex-col items-end">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                </span>
                <span>Menuju {nextPrayer.name}</span>
              </div>
              <span className="text-lg sm:text-xl font-mono font-black text-amber-300 tracking-wider tabular-nums drop-shadow-sm">
                {formatCountdownHMS(secondsToNext)}
              </span>
            </div>
          )}

          {/* Tombol Audio Notifikasi Adzan */}
          <button
            onClick={handleToggleSound}
            className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-md active:scale-95 ${
              soundEnabled
                ? 'bg-amber-400 text-amber-950 border-amber-300 shadow-amber-400/20 font-black'
                : 'bg-white/10 border-white/20 text-gray-300 hover:bg-white/20'
            }`}
            title={soundEnabled ? 'Notifikasi Suara Adzan: Aktif (Klik untuk membisukan)' : 'Notifikasi Suara Adzan: Nonaktif (Klik untuk mengaktifkan)'}
          >
            {soundEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            <span className="text-[9px] font-bold uppercase tracking-tight">
              {soundEnabled ? 'Suara On' : 'Bisu'}
            </span>
          </button>
        </div>
      </div>

      {/* 3. BARIS 7 KARTU WAKTU SHOLAT: SUBUH, TERBIT, DLUHA, DHUHUR, ASHAR, MAGHRIB, ISYA' */}
      <div className="relative z-10 pt-4 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
          {prayers.map((prayer) => {
            const isHighlighted = prayer.isNext;
            const isPassed = prayer.isPassed;

            return (
              <div
                key={prayer.id}
                className={`relative flex flex-col items-center justify-between p-3.5 rounded-2xl transition-all duration-300 overflow-hidden ${
                  isHighlighted
                    ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-amber-950 font-black shadow-xl shadow-amber-500/25 scale-[1.03] border-2 border-amber-200 ring-4 ring-amber-400/25 z-20'
                    : isPassed
                      ? 'bg-white/[0.06] hover:bg-white/[0.10] text-gray-300 border border-white/10 backdrop-blur-md'
                      : 'bg-white/[0.10] hover:bg-white/[0.16] text-white border border-white/20 backdrop-blur-md shadow-md'
                }`}
              >
                {/* Aksen Lengkungan Kubah Mihrab untuk Kartu Aktif */}
                {isHighlighted && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-amber-100/80" />
                )}

                {/* Header Kartu: Ikon & Nama Sholat */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  {getPrayerIcon(prayer.id, isHighlighted)}
                  <span 
                    className={`text-xs sm:text-sm tracking-tight ${
                      isHighlighted ? 'font-black text-amber-950' : 'font-bold text-gray-100'
                    }`}
                  >
                    {prayer.name}
                  </span>
                </div>

                {/* Waktu Sholat Jam:Menit (HH:mm) */}
                <span 
                  className={`text-xl sm:text-2xl font-black tracking-tight my-1 tabular-nums ${
                    isHighlighted ? 'text-amber-950 font-black drop-shadow-xs' : 'text-amber-300'
                  }`}
                >
                  {prayer.timeStr}
                </span>

                {/* Keterangan Status Kartu */}
                <div className="mt-1">
                  {isHighlighted ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-amber-950/20 text-amber-950 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-950 animate-pulse" />
                      Berikutnya
                    </span>
                  ) : isPassed ? (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-300/80">
                      <CheckCircle2 size={10} />
                      Selesai
                    </span>
                  ) : (
                    <span className="text-[9px] font-medium text-gray-400">
                      Mendatang
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. CHIPS PILIHAN KOTA CEPAT (DEMAK PERTAMA) */}
      <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 text-[11px] no-scrollbar">
        <span className="text-amber-300/80 shrink-0 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
          <Compass size={11} className="text-amber-400" />
          Pilihan Wilayah:
        </span>
        {QUICK_CITIES.map((c) => {
          const isSelected = currentLocation.name.toLowerCase() === c.name.toLowerCase();
          const isDemak = c.name === 'Demak';

          return (
            <button
              key={c.name}
              onClick={() => handleSelectCity(c)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer ${
                isSelected
                  ? 'bg-amber-400 text-amber-950 shadow-md shadow-amber-400/20 border border-amber-300'
                  : 'bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10'
              }`}
            >
              {isDemak && <span className="text-amber-300 font-extrabold">{isSelected ? '★' : '⭐'}</span>}
              <span>{c.name}</span>
              {isDemak && <span className="text-[9px] opacity-75">(Pusat)</span>}
            </button>
          );
        })}
        <button
          onClick={() => setIsCityModalOpen(true)}
          className="text-amber-300 hover:text-amber-200 underline text-[11px] font-semibold shrink-0 ml-1.5 cursor-pointer"
        >
          Cari Kota Lain...
        </button>
      </div>

      {/* 5. FOOTER WIDGET: STATUS KOORDINAT, UJI SUARA, & TOMBOL GPS */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-white/15 text-[11px] text-blue-100/80">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-teal-300 font-medium">
            <Navigation size={12} className={isGpsLoading ? 'text-amber-300 animate-pulse' : ''} />
            <span>
              {isGpsLoading 
                ? 'Mendeteksi posisi GPS...' 
                : `${currentLocation.name} (${currentLocation.lat.toFixed(2)}°, ${currentLocation.lng.toFixed(2)}°) • Hisab Kemenag RI`}
            </span>
          </div>

          {isGpsDenied && (
            <button
              onClick={() => setIsGpsHelpOpen(true)}
              className="text-amber-300 hover:underline flex items-center gap-1 font-bold ml-1 cursor-pointer bg-amber-400/15 px-2 py-0.5 rounded-lg border border-amber-400/30"
              title="Informasi perizinan GPS browser"
            >
              <Info size={11} />
              <span>Info Izin GPS</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Tombol Uji Suara Adzan */}
          <button
            onClick={handleTestSound}
            disabled={testSoundPlaying}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-400/20 to-amber-500/20 hover:from-amber-400/30 hover:to-amber-500/30 active:scale-95 px-3 py-1 rounded-xl border border-amber-400/30 text-amber-200 font-bold transition cursor-pointer disabled:opacity-50"
            title="Dengarkan contoh nada adzan sholat"
          >
            <Volume2 size={13} className={testSoundPlaying ? 'text-amber-300 animate-pulse' : 'text-amber-400'} />
            <span>{testSoundPlaying ? 'Memutar Adzan...' : 'Uji Suara Adzan'}</span>
          </button>

          <button
            onClick={() => setIsCityModalOpen(true)}
            className="text-amber-300 hover:text-amber-200 font-bold underline cursor-pointer px-1"
          >
            Ganti Lokasi
          </button>
        </div>
      </div>

      {/* MODAL PANDUAN IZIN GPS & SOLUSI CEPAT */}
      {isGpsHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-400/40 w-full max-w-md rounded-3xl p-5 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Compass className="text-amber-400" size={19} />
                <h3 className="font-bold text-base text-gray-100">Pengaturan Lokasi Jadwal Sholat</h3>
              </div>
              <button
                onClick={() => setIsGpsHelpOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-3 space-y-3 text-xs text-gray-300 leading-relaxed">
              <div className="p-3 rounded-2xl bg-amber-400/15 border border-amber-400/35 text-amber-200">
                <p className="font-bold mb-1">💡 Lokasi Default: Kota Demak, Jawa Tengah</p>
                <p className="text-[11px] opacity-90">
                  Jadwal sholat sudah otomatis berjalan akurat 100% untuk Demak dan sekitarnya. Jika ingin mengubah kota, silakan pilih langsung di bawah ini:
                </p>
              </div>

              {/* Pilihan Kota Cepat */}
              <div>
                <p className="font-bold text-gray-200 mb-2">Pilih Kota Langsung:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_CITIES.map((c) => (
                    <button
                      key={`modal-${c.name}`}
                      onClick={() => handleSelectCity(c)}
                      className={`p-2.5 rounded-xl text-left font-bold transition flex items-center justify-between cursor-pointer ${
                        currentLocation.name.toLowerCase() === c.name.toLowerCase()
                          ? 'bg-amber-400 text-amber-950 shadow-md'
                          : 'bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700'
                      }`}
                    >
                      <span>{c.name}</span>
                      <MapPin size={12} className="opacity-75" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Panduan Mengaktifkan GPS */}
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                <p className="font-bold text-white mb-1">Cara Mengaktifkan GPS di Browser:</p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-gray-300">
                  <li>Klik ikon <strong>Gembok (🔒)</strong> di samping URL browser.</li>
                  <li>Ubah izin <strong>Lokasi</strong> menjadi <strong>Izinkan (Allow)</strong>.</li>
                  <li>Muat ulang halaman untuk membaca GPS otomatis.</li>
                </ol>
              </div>
            </div>

            <button
              onClick={() => setIsGpsHelpOpen(false)}
              className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-black py-2.5 px-4 rounded-xl shadow-md transition active:scale-[0.98] cursor-pointer mt-1"
            >
              Gunakan Jadwal Kota {currentLocation.name}
            </button>
          </div>
        </div>
      )}

      {/* MODAL PEMILIHAN KOTA & GPS */}
      {isCityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-400/40 w-full max-w-md rounded-3xl p-5 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="text-amber-400" size={18} />
                <h3 className="font-bold text-base text-gray-100">Pilih Kota Jadwal Sholat</h3>
              </div>
              <button
                onClick={() => setIsCityModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tombol Deteksi GPS Otomatis */}
            <div className="my-3">
              <button
                onClick={() => {
                  detectGpsLocation(true);
                  setIsCityModalOpen(false);
                }}
                disabled={isGpsLoading}
                className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition active:scale-[0.98] cursor-pointer"
              >
                <Navigation size={16} className={isGpsLoading ? 'animate-spin' : ''} />
                <span>Gunakan Lokasi GPS Saya Saat Ini</span>
              </button>
              <p className="text-[11px] text-gray-400 text-center mt-1">
                Akurasi astronomis berdasarkan koordinat lintang & bujur perangkat Anda.
              </p>
            </div>

            {/* Input Pencarian Kota */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Cari nama kota (Demak, Semarang, Kudus, Surabaya...)"
                value={searchCityQuery}
                onChange={e => setSearchCityQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-400 focus:outline-hidden focus:border-amber-400"
              />
            </div>

            {/* Daftar Kota */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {filteredCities.map((city) => {
                const isSelected = city.name.toLowerCase() === currentLocation.name.toLowerCase();
                const isDemak = city.name === 'Demak';

                return (
                  <button
                    key={`${city.name}-${city.lat}`}
                    onClick={() => handleSelectCity(city)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400/25 border border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-gray-200'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        <span>{city.name}</span>
                        {isDemak && (
                          <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded-md font-bold">
                            Default
                          </span>
                        )}
                      </div>
                      {city.province && <div className="text-[10px] text-gray-400">{city.province}</div>}
                    </div>
                    {isSelected && <Check size={16} className="text-amber-400" />}
                  </button>
                );
              })}
              {filteredCities.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-400">
                  Kota tidak ditemukan. Silakan gunakan tombol GPS di atas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP SAAT MASUK WAKTU SHOLAT */}
      {activeAlertPrayer && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 border-2 border-amber-400 w-full max-w-sm rounded-3xl p-6 text-white text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-400/25 animate-bounce">
              <Sparkles size={28} className="text-amber-300" />
            </div>

            <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
              Panggilan Sholat Fardhu
            </span>

            <h3 className="text-2xl font-black text-amber-300 mt-1">
              Masuk Waktu {activeAlertPrayer.name}
            </h3>

            <p className="text-xs text-gray-300 mt-2 leading-relaxed">
              Telah tiba waktu sholat <strong className="text-white">{activeAlertPrayer.name} ({activeAlertPrayer.timeStr} WIB)</strong> untuk wilayah <strong className="text-amber-300">{currentLocation.name}</strong> dan sekitarnya.
            </p>

            <div className="mt-5 space-y-2">
              <button
                onClick={() => setActiveAlertPrayer(null)}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-amber-950 font-black py-2.5 px-4 rounded-xl shadow-lg transition active:scale-[0.98] cursor-pointer"
              >
                Alhamdulillah, Siap Tunaikan Sholat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

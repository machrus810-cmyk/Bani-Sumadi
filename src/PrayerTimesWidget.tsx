// ==========================================
// KOMPONEN JADWAL WAKTU SHOLAT INTERAKTIF
// Menampilkan 7 Waktu: Subuh, Terbit, Dluha, Dhuhur, Ashar, Maghrib, Isya'
// Desain modern bernuansa islami sesuai screenshot referensi
// Dilengkapi deteksi GPS otomatis + fallback IP & pemilih kota instan
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
  HelpCircle,
  ExternalLink,
  ShieldAlert
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
  PrayerItem,
  CityLocation
} from './prayerTimes';
import { requestNotificationPermission } from './audioNotification';

interface PrayerTimesWidgetProps {
  showToast?: (m: string, t?: 'success' | 'error') => void;
}

// Kota-kota ringkas favorit untuk akses 1-sentuhan cepat
const QUICK_CITIES: CityLocation[] = [
  { name: 'Surabaya', province: 'Jawa Timur', lat: -7.2575, lng: 112.7521 },
  { name: 'Tuban', province: 'Jawa Timur', lat: -6.8966, lng: 112.0648 },
  { name: 'Lamongan', province: 'Jawa Timur', lat: -7.1282, lng: 112.4132 },
  { name: 'Gresik', province: 'Jawa Timur', lat: -7.1566, lng: 112.6555 },
  { name: 'Sidoarjo', province: 'Jawa Timur', lat: -7.4726, lng: 112.6675 },
  { name: 'Bojonegoro', province: 'Jawa Timur', lat: -7.1502, lng: 111.8817 },
  { name: 'Malang', province: 'Jawa Timur', lat: -7.9797, lng: 112.6304 },
  { name: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 }
];

export const PrayerTimesWidget: React.FC<PrayerTimesWidgetProps> = ({ showToast }) => {
  // Lokasi default: Surabaya (sesuai referensi user)
  const defaultCity = POPULAR_CITIES[0]; // Surabaya

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
  const [gpsError, setGpsError] = useState<string | null>(null);
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

  // Timer interval 1 detik untuk countdown dan update waktu
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

  // Fungsi Deteksi Lokasi Otomatis (GPS dengan Fallback Cerdas ke IP Geolocation)
  const detectGpsLocation = async (isManualTrigger = false) => {
    setIsGpsLoading(true);
    setGpsError(null);

    // Jika browser tidak memiliki navigator.geolocation
    if (!navigator.geolocation) {
      fallbackToIpDetection(isManualTrigger, 'Browser tidak mendukung GPS');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // Cari kota terdekat dari daftar offline
        let matchedCity = findNearestCity(latitude, longitude);

        // Coba reverse geocoding untuk nama kecamatan / kota yang lebih spesifik
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
          // Tetap gunakan matchedCity dari tabel terdekat
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
        setGpsError(null);
        setIsGpsLoading(false);

        if (isManualTrigger && showToast) {
          showToast(`📍 Lokasi GPS diperbarui: ${matchedCity.name}`, 'success');
        }
      },
      async (err) => {
        // Izin GPS ditolak atau dibatasi
        setIsGpsDenied(true);
        // Lakukan otomatis fallback ke deteksi IP tanpa error mengganggu
        await fallbackToIpDetection(isManualTrigger, err.code === 1 ? 'Izin akses lokasi GPS dibatasi di browser' : 'Posisi GPS tidak terdeteksi');
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  };

  // Fallback ke Deteksi IP Otomatis jika GPS ditolak
  const fallbackToIpDetection = async (isManualTrigger: boolean, reason: string) => {
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
        setGpsError(null);

        if (isManualTrigger) {
          if (showToast) {
            showToast(`📍 Terdeteksi otomatis via IP: ${ipLoc.name}`, 'success');
          }
        }
        return;
      }
    } catch {
      // Abaikan
    }

    setIsGpsLoading(false);
    // Jika user mengklik manual tombol GPS dan gagal, buka panduan/pemilih kota
    if (isManualTrigger) {
      setIsGpsHelpOpen(true);
      if (showToast) {
        showToast('Izin GPS dibatasi. Silakan pilih kota Anda langsung.', 'error');
      }
    }
  };

  // Coba GPS otomatis saat pertama kali komponen dimuat jika belum ada lokasi tersimpan
  useEffect(() => {
    const saved = getSavedLocation();
    if (!saved) {
      detectGpsLocation(false);
    }
  }, []);

  // Toggle suara adhan/alarm
  const handleToggleSound = async () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    setPrayerSoundEnabled(nextState);

    if (nextState) {
      await requestNotificationPermission();
      if (showToast) showToast('🔔 Notifikasi & alarm suara sholat diaktifkan', 'success');
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
      showToast(`📍 Lokasi diubah ke: ${city.name}`, 'success');
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
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#203a72] via-[#264585] to-[#1c3260] text-white shadow-xl border border-blue-400/30 p-4 sm:p-5 select-none transition-all duration-300">
      {/* Aksen Latar Belakang Geometris Islami Halus */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255, 215, 0, 0.25) 0%, transparent 60%)'
        }}
      />

      {/* 1. BAR ATAS: ICON MASJID, LOKASI KOTA GPS & COUNTDOWN MENIKMATI SHOLAT */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-3">
        {/* Sisi Kiri: Icon Masjid & Label Jadwal Sholat Kota */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mosque Icon Badge */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-500/25 border border-teal-400/40 flex items-center justify-center shrink-0 shadow-inner">
            <svg 
              className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300" 
              viewBox="0 0 24 24" 
              fill="currentColor"
            >
              {/* Desain Siluet Masjid Vektor Rapi */}
              <path d="M12 2C11.5 2 11 2.5 11 3C11 3.2 11.1 3.4 11.2 3.5L10 4.7C8.5 6.2 7 8 7 10V11H17V10C17 8 15.5 6.2 14 4.7L12.8 3.5C12.9 3.4 13 3.2 13 3C13 2.5 12.5 2 12 2Z" />
              <path d="M4 8H6V19H4V8ZM18 8H20V19H18V8Z" />
              <path d="M7 12H17V21H14V16C14 14.9 13.1 14 12 14C10.9 14 10 14.9 10 16V21H7V12Z" />
              <path d="M2 20H22V22H2V20Z" />
            </svg>
          </div>

          {/* Nama Kota & Dropdown/Refresh GPS */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-gray-200">
              Jadwal Sholat:
            </span>
            <button
              onClick={() => setIsCityModalOpen(true)}
              className="flex items-center gap-1 text-xs sm:text-sm font-extrabold text-amber-300 hover:text-amber-200 bg-black/25 hover:bg-black/40 px-2 py-0.5 rounded-lg border border-amber-400/30 transition-all cursor-pointer group"
              title="Klik untuk memilih kota atau perbarui lokasi"
            >
              <span>{currentLocation.name}</span>
              <MapPin size={13} className="text-amber-400 group-hover:scale-110 transition-transform" />
              <ChevronDown size={11} className="text-gray-300 opacity-70 group-hover:opacity-100" />
            </button>
            <button
              onClick={() => detectGpsLocation(true)}
              disabled={isGpsLoading}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-blue-200 hover:text-white transition disabled:opacity-50 cursor-pointer"
              title="Deteksi lokasi GPS saat ini"
            >
              <RotateCw size={12} className={isGpsLoading ? 'animate-spin text-amber-300' : ''} />
            </button>
          </div>
        </div>

        {/* Sisi Kanan: Badge Countdown Menuju Sholat Berikutnya */}
        <div className="flex items-center gap-2 ml-auto">
          {nextPrayer && (
            <div className="bg-black/35 backdrop-blur-xs border border-white/15 px-3 py-1.5 rounded-xl shadow-inner flex items-center gap-1.5">
              <span className="text-[11px] sm:text-xs font-semibold text-gray-300">
                Menuju {nextPrayer.name}
              </span>
              <span className="text-xs sm:text-sm font-mono font-black text-amber-300 tabular-nums">
                {formatCountdownHMS(secondsToNext)}
              </span>
            </div>
          )}

          {/* Tombol Pengatur Suara Notifikasi Sholat */}
          <button
            onClick={handleToggleSound}
            className={`p-1.5 rounded-xl border transition cursor-pointer flex items-center justify-center ${
              soundEnabled
                ? 'bg-amber-400/20 border-amber-400/40 text-amber-300 hover:bg-amber-400/30'
                : 'bg-white/10 border-white/20 text-gray-400 hover:bg-white/20 hover:text-gray-200'
            }`}
            title={soundEnabled ? 'Notifikasi Suara Sholat: Aktif (Klik untuk matikan)' : 'Notifikasi Suara Sholat: Nonaktif (Klik untuk aktifkan)'}
          >
            {soundEnabled ? <Bell size={15} /> : <BellOff size={15} />}
          </button>
        </div>
      </div>

      {/* 2. BARIS 7 KARTU WAKTU SHOLAT: SUBUH, TERBIT, DLUHA, DHUHUR, ASHAR, MAGHRIB, ISYA' */}
      <div className="relative z-10 grid grid-cols-4 sm:grid-cols-7 gap-2 overflow-x-auto pb-1 pt-1">
        {prayers.map((prayer) => {
          const isHighlighted = prayer.isNext;

          return (
            <div
              key={prayer.id}
              className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl transition-all duration-300 ${
                isHighlighted
                  ? 'bg-amber-400 text-amber-950 font-black shadow-lg shadow-amber-400/25 scale-[1.02] border-2 border-amber-300 ring-2 ring-amber-400/40'
                  : 'bg-white/10 hover:bg-white/15 text-white/90 border border-white/15 backdrop-blur-xs'
              }`}
            >
              {/* Nama Waktu Sholat */}
              <span 
                className={`text-[11px] sm:text-xs tracking-tight ${
                  isHighlighted ? 'font-black text-amber-950' : 'font-medium text-gray-200'
                }`}
              >
                {prayer.name}
              </span>

              {/* Jam Waktu Sholat (HH:mm) */}
              <span 
                className={`text-sm sm:text-base font-black tracking-tight mt-0.5 tabular-nums ${
                  isHighlighted ? 'text-amber-950 font-black' : 'text-white'
                }`}
              >
                {prayer.timeStr}
              </span>

              {/* Status Indicator Halus */}
              {isHighlighted && (
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 bg-amber-950/15 rounded-full mt-1">
                  Berikutnya
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. CHIPS PEMILIH KOTA CEPAT (1-SENTUHAN INSTAN) */}
      <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto pt-2.5 pb-1 text-[11px] no-scrollbar">
        <span className="text-blue-200/75 shrink-0 text-[10px] font-bold uppercase tracking-wider">
          Pilihan Cepat:
        </span>
        {QUICK_CITIES.map((c) => {
          const isSelected = currentLocation.name.toLowerCase() === c.name.toLowerCase();
          return (
            <button
              key={c.name}
              onClick={() => handleSelectCity(c)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 transition cursor-pointer ${
                isSelected
                  ? 'bg-amber-400 text-amber-950 font-bold shadow-xs'
                  : 'bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10'
              }`}
            >
              {c.name}
            </button>
          );
        })}
        <button
          onClick={() => setIsCityModalOpen(true)}
          className="text-amber-300 hover:text-amber-200 underline text-[11px] font-semibold shrink-0 ml-1 cursor-pointer"
        >
          Lainnya...
        </button>
      </div>

      {/* 4. FOOTER WIDGET: STATUS LOKASI & UJI AUDIO */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-white/10 text-[11px] text-blue-100/80">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Navigation size={11} className={isGpsLoading ? 'text-amber-300 animate-pulse' : 'text-teal-300'} />
          <span>
            {isGpsLoading 
              ? 'Mencari koordinat...' 
              : `Lokasi: ${currentLocation.name} (${
                  locationSource === 'gps' 
                    ? 'GPS Akurat' 
                    : locationSource === 'ip' 
                      ? 'Otomatis' 
                      : 'Kota Pilihan'
                })`}
          </span>

          {/* Jika GPS dibatasi, beri petunjuk ramah tanpa pesan error yang mengganggu */}
          {isGpsDenied && (
            <button
              onClick={() => setIsGpsHelpOpen(true)}
              className="text-amber-300 hover:underline flex items-center gap-0.5 font-semibold ml-1 cursor-pointer bg-amber-400/10 px-1.5 py-0.2 rounded-md"
              title="Pelajari cara mengaktifkan izin GPS di browser Anda"
            >
              <Info size={10} />
              <span>Info Izin GPS</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleTestSound}
            disabled={testSoundPlaying}
            className="flex items-center gap-1 bg-white/10 hover:bg-white/20 active:scale-95 px-2 py-0.5 rounded-lg border border-white/15 text-white transition cursor-pointer disabled:opacity-50"
            title="Dengarkan contoh nada adhan sholat"
          >
            <Volume2 size={12} className={testSoundPlaying ? 'text-amber-300 animate-pulse' : 'text-gray-300'} />
            <span>{testSoundPlaying ? 'Memutar...' : 'Uji Suara'}</span>
          </button>

          <button
            onClick={() => setIsCityModalOpen(true)}
            className="text-amber-300 hover:text-amber-200 underline font-semibold cursor-pointer"
          >
            Ganti Kota
          </button>
        </div>
      </div>

      {/* MODAL PANDUAN IZIN GPS & SOLUSI CEPAT */}
      {isGpsHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-5 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-amber-400" size={19} />
                <h3 className="font-bold text-base text-gray-100">Izin Akses Lokasi GPS</h3>
              </div>
              <button
                onClick={() => setIsGpsHelpOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-3 space-y-3 text-xs text-gray-300 leading-relaxed">
              <div className="p-3 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-amber-200">
                <p className="font-bold mb-1">💡 Izin Lokasi di Browser Sedang Dibatasi</p>
                <p className="text-[11px] opacity-90">
                  Jangan khawatir, jadwal sholat tetap bekerja dengan akurat 100% menggunakan kota yang Anda pilih di bawah ini:
                </p>
              </div>

              {/* Pilihan Kota Cepat */}
              <div>
                <p className="font-bold text-gray-200 mb-2">Pilih Kota Anda Langsung (Paling Mudah):</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_CITIES.map((c) => (
                    <button
                      key={`modal-${c.name}`}
                      onClick={() => handleSelectCity(c)}
                      className={`p-2 rounded-xl text-left font-bold transition flex items-center justify-between cursor-pointer ${
                        currentLocation.name.toLowerCase() === c.name.toLowerCase()
                          ? 'bg-amber-400 text-amber-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700'
                      }`}
                    >
                      <span>{c.name}</span>
                      <MapPin size={12} className="opacity-75" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Panduan Mengaktifkan di Browser */}
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                <p className="font-bold text-white mb-1.5">Cara Mengaktifkan GPS di Browser:</p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-gray-300">
                  <li>Klik ikon <strong>Gembok (🔒)</strong> atau <strong>Setelan Situs</strong> di samping bilah alamat web (URL bar).</li>
                  <li>Ubah izin <strong>Lokasi (Location)</strong> menjadi <strong>Izinkan (Allow)</strong>.</li>
                  <li>Muat ulang (refresh) halaman aplikasi.</li>
                </ol>
              </div>
            </div>

            <button
              onClick={() => setIsGpsHelpOpen(false)}
              className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold py-2.5 px-4 rounded-xl shadow-md transition active:scale-[0.98] cursor-pointer mt-1"
            >
              Mengerti & Gunakan Kota Terpilih
            </button>
          </div>
        </div>
      )}

      {/* MODAL PEMILIHAN KOTA & GPS */}
      {isCityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-5 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="text-amber-400" size={18} />
                <h3 className="font-bold text-base text-gray-100">Pilih Lokasi Jadwal Sholat</h3>
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
                className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition active:scale-[0.98] cursor-pointer"
              >
                <Navigation size={16} className={isGpsLoading ? 'animate-spin' : ''} />
                <span>Gunakan Lokasi GPS Saya Saat Ini</span>
              </button>
              <p className="text-[11px] text-gray-400 text-center mt-1">
                Akurasi astronomis berdasarkan posisi lintang & bujur perangkat Anda.
              </p>
            </div>

            {/* Input Pencarian Kota */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Cari nama kota (Surabaya, Tuban, Lamongan...)"
                value={searchCityQuery}
                onChange={e => setSearchCityQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-400 focus:outline-hidden focus:border-amber-400"
              />
            </div>

            {/* Daftar Kota */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {filteredCities.map((city) => {
                const isSelected = city.name.toLowerCase() === currentLocation.name.toLowerCase();
                return (
                  <button
                    key={`${city.name}-${city.lat}`}
                    onClick={() => handleSelectCity(city)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400/20 border border-amber-400/40 text-amber-300 font-bold'
                        : 'bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-gray-200'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">{city.name}</div>
                      {city.province && <div className="text-[10px] text-gray-400">{city.province}</div>}
                    </div>
                    {isSelected && <Check size={16} className="text-amber-400" />}
                  </button>
                );
              })}
              {filteredCities.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-400">
                  Kota tidak ditemukan. Coba gunakan fitur tombol GPS di atas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL POPUP SAAT MASUK WAKTU SHOLAT */}
      {activeAlertPrayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 border-2 border-amber-400/60 w-full max-w-sm rounded-3xl p-6 text-white text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-400/20 animate-bounce">
              <Sparkles size={28} className="text-amber-300" />
            </div>

            <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
              Panggilan Ibadah
            </span>

            <h3 className="text-2xl font-black text-amber-300 mt-1">
              Masuk Waktu Sholat {activeAlertPrayer.name}
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

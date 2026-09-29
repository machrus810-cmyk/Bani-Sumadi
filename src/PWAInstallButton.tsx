import React, { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'banner' | 'card' }> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running inside installed standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  // If not installable and not iOS, don't show unless in banner or card mode
  if (!isInstallable && !isIOS && variant === 'header') {
    return null;
  }

  const handleAction = () => {
    if (isInstallable) {
      install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'header' && (
        <button
          onClick={handleAction}
          className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
          title="Pasang aplikasi ke layar utama HP / Komputer"
        >
          <Download size={13} className="shrink-0" />
          <span>Install Aplikasi</span>
        </button>
      )}

      {variant === 'banner' && (
        <div className="bg-gradient-to-r from-emerald-800 to-green-700 text-white p-3.5 rounded-2xl shadow-sm border border-emerald-600/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-amber-300 shrink-0">
              <Download size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">Pasang Aplikasi Bani Sumadi</p>
              <p className="text-[10px] text-green-100 opacity-90 truncate">Akses instan dari beranda HP & bisa dibuka offline</p>
            </div>
          </div>
          <button
            onClick={handleAction}
            className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs px-3 py-1.5 rounded-xl shadow-xs shrink-0 cursor-pointer transition active:scale-95"
          >
            Pasang
          </button>
        </div>
      )}

      {/* MODAL PANDUAN INSTALL IOS & MANUAL */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl text-gray-800 relative">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-3.5 right-3.5 text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              title="Tutup"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 text-green-800 flex items-center justify-center">
                <Download size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">Cara Pasang ke Layar Utama</h3>
                <p className="text-[11px] text-gray-500">Agar bisa dibuka langsung & offline</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-gray-600 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <p>Tekan tombol <strong className="inline-flex items-center gap-0.5 text-gray-800"><Share size={12}/> Bagikan (Share)</strong> di bilah Safari bawah.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <p>Gulir ke bawah lalu pilih menu <strong className="inline-flex items-center gap-0.5 text-gray-800"><PlusSquare size={12}/> Tambahkan ke Layar Utama</strong> (Add to Home Screen).</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <p>Tekan <strong>Tambah (Add)</strong> di pojok kanan atas. Ikon aplikasi akan langsung muncul di HP Anda!</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <p>Tekan ikon menu <strong>titik tiga (⋮)</strong> di pojok kanan atas browser Chrome / browser HP Anda.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <p>Pilih menu <strong>Install Aplikasi</strong> atau <strong>Tambahkan ke Layar Utama</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <p>Aplikasi Bani Sumadi kini siap digunakan seperti aplikasi HP asli tanpa perlu membuka browser lagi.</p>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full rounded-xl bg-green-700 py-2.5 text-xs font-bold text-white hover:bg-green-800 transition cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
  minDisplayTimeMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ 
  onFinish, 
  minDisplayTimeMs = 500 
}) => {
  const [isFading, setIsFading] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setIsFading(true);
      hideTimer = setTimeout(() => {
        setIsVisible(false);
        onFinish?.();
      }, 200);
    }, minDisplayTimeMs);

    return () => {
      clearTimeout(timer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [minDisplayTimeMs, onFinish]);

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-green-900 via-green-800 to-emerald-950 text-white transition-opacity duration-200 ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* BACKGROUND ORNAMENTAL PATTERN */}
      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#facc15_1px,transparent_1px)] [background-size:20px_20px]"></div>

      {/* CENTRAL LOGO CONTAINER */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* GLOWING AMBIENT RING */}
        <div className="relative mb-6">
          <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 opacity-60 blur-lg"></div>
          <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full p-1.5 bg-gradient-to-tr from-amber-400 via-amber-200 to-yellow-500 shadow-2xl">
            <img 
              src="/logo.jpg" 
              alt="Logo Keluarga Besar KH. Sumadi" 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full shadow-inner"
            />
          </div>
        </div>

        {/* TITLES */}
        <div className="space-y-1.5 max-w-xs">
          <span className="text-[11px] uppercase tracking-widest font-black text-amber-300 drop-shadow-sm">
            Silsilah & Kerukunan
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide leading-tight drop-shadow-md">
            Keluarga Besar<br />
            <span className="text-amber-300">KH. SUMADI</span>
          </h1>
          <p className="text-xs text-green-100/90 font-medium pt-1">
            "Menjalin Silaturrahim, Mempererat Persaudaraan"
          </p>
        </div>

        {/* PROGRESS / LOADING BAR */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="w-36 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="w-full h-full bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full"></div>
          </div>
          <span className="text-[10px] text-green-200 font-semibold tracking-wider">
            Memuat Aplikasi...
          </span>
        </div>
      </div>

      {/* FOOTER BADGE */}
      <div className="absolute bottom-6 text-[10px] text-green-200/70 font-medium tracking-wide">
        Bani Sumadi • Official Application
      </div>
    </div>
  );
};

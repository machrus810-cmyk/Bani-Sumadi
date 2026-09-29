import React from 'react';
import { WifiOff, Database } from 'lucide-react';
import { useOnlineStatus } from './useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-[350] w-[92%] max-w-sm pointer-events-none animate-fade-in">
      <div className="bg-amber-600/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-2xl shadow-xl border border-amber-400/50 flex items-center justify-between gap-2.5 text-xs font-medium">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <WifiOff size={13} className="text-amber-100" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[11px] leading-tight flex items-center gap-1">
              Mode Offline
              <span className="w-1.5 h-1.5 rounded-full bg-amber-200 animate-pulse"></span>
            </p>
            <p className="text-[10px] text-amber-100/90 leading-tight truncate">
              Data tersimpan di perangkat & tetap dapat diakses
            </p>
          </div>
        </div>
        <div className="shrink-0 bg-white/15 px-2 py-0.5 rounded-md text-[9px] font-bold text-amber-100 flex items-center gap-1">
          <Database size={10} /> Cache Aktif
        </div>
      </div>
    </div>
  );
};

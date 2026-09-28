import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Check, X, Crop } from 'lucide-react';

interface ImageCropperModalProps {
  imageSrc: string;
  onCrop: (croppedBase64: string) => void;
  onCancel: () => void;
  title?: string;
}

export default function ImageCropperModal({
  imageSrc,
  onCrop,
  onCancel,
  title = 'Sesuaikan & Potong Foto'
}: ImageCropperModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialOffsetRef = useRef({ x: 0, y: 0 });

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
  }, [imageSrc]);

  // Handle Drag / Pan
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialOffsetRef.current = { ...offset };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: initialOffsetRef.current.x + dx,
      y: initialOffsetRef.current.y + dy
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Perform Final Crop on Canvas
  const handleSaveCrop = useCallback(() => {
    if (!imageRef.current) return;
    const img = imageRef.current;

    const cropBoxSize = 260; // preview crop frame in px
    const outputSize = 400; // high-res output avatar

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputSize, outputSize);

    // Apply Transformations centered on canvas
    ctx.save();
    ctx.translate(outputSize / 2, outputSize / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    const scaleFactor = (outputSize / cropBoxSize) * zoom;
    ctx.scale(scaleFactor, scaleFactor);

    // Coordinate offset transformed
    // Account for rotation
    const rad = (-rotation * Math.PI) / 180;
    const rotatedOffsetX = offset.x * Math.cos(rad) - offset.y * Math.sin(rad);
    const rotatedOffsetY = offset.x * Math.sin(rad) + offset.y * Math.cos(rad);

    ctx.translate(rotatedOffsetX, rotatedOffsetY);

    // Draw image centered
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();

    const croppedBase64 = canvas.toDataURL('image/jpeg', 0.88);
    onCrop(croppedBase64);
  }, [offset, rotation, zoom, onCrop]);

  return (
    <div className="fixed inset-0 z-[350] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col border border-gray-100">
        
        {/* HEADER */}
        <div className="bg-green-700 px-5 py-3.5 text-white flex justify-between items-center shadow">
          <div className="flex items-center gap-2">
            <Crop size={18} />
            <h3 className="font-bold text-sm tracking-wide">{title}</h3>
          </div>
          <button 
            onClick={onCancel}
            className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* CROP VIEWPORT */}
        <div className="p-4 bg-gray-900 flex flex-col items-center justify-center relative overflow-hidden">
          <p className="text-[11px] text-gray-300 mb-2 font-medium">
            Geser dan sesuaikan posisi wajah pada lingkaran
          </p>

          <div 
            className="relative w-[260px] h-[260px] bg-black rounded-2xl overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing touch-none shadow-inner"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* The Image being transformed */}
            {imageLoaded && (
              <img
                src={imageSrc}
                alt="Source to crop"
                draggable={false}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                  transformOrigin: 'center center',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  position: 'absolute'
                }}
                className="pointer-events-none transition-transform duration-75 ease-out"
              />
            )}

            {/* Circular Crop Overlay Guide */}
            <div className="absolute inset-0 pointer-events-none border-[3px] border-emerald-400 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"></div>
            {/* Crosshair guide lines */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
              <div className="w-full h-[1px] bg-white"></div>
              <div className="h-full w-[1px] bg-white absolute"></div>
            </div>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="p-5 space-y-4 bg-white">
          {/* Zoom Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-gray-600">
              <span className="flex items-center gap-1"><ZoomIn size={14} className="text-green-600"/> Zoom</span>
              <span className="text-[11px] text-gray-400">{Math.round(zoom * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setZoom(z => Math.max(0.6, z - 0.15))}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition cursor-pointer"
              >
                <ZoomOut size={16} />
              </button>
              <input 
                type="range" 
                min="0.6" 
                max="3" 
                step="0.05"
                value={zoom} 
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-green-600 h-2 bg-gray-200 rounded-lg cursor-pointer"
              />
              <button 
                type="button"
                onClick={() => setZoom(z => Math.min(3, z + 0.15))}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition cursor-pointer"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>

          {/* Quick Actions (Rotate, Reset) */}
          <div className="flex justify-between items-center pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setRotation(r => (r + 90) % 360)}
              className="text-xs font-bold text-gray-600 hover:text-green-700 flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              <RotateCw size={14} />
              <span>Putar 90°</span>
            </button>

            <button
              type="button"
              onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); setRotation(0); }}
              className="text-xs font-bold text-gray-400 hover:text-gray-600 transition cursor-pointer"
            >
              Reset Posisi
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveCrop}
              className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-sm shadow-md hover:from-green-700 hover:to-emerald-700 transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check size={16} strokeWidth={3} />
              <span>Terapkan Potongan</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Download, X, Image as ImageIcon, Check } from 'lucide-react';
import { ExportFormat, ExportSettings, ImageDimensions } from '../types/liquify';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: ExportSettings) => Promise<void>;
  dimensions: ImageDimensions;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  dimensions
}) => {
  const [format, setFormat] = useState<ExportFormat>('image/png');
  const [quality, setQuality] = useState<number>(0.95);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await onExport({ format, quality });
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const getFormatLabel = (fmt: ExportFormat) => {
    switch (fmt) {
      case 'image/png': return 'PNG — Lossless, highest quality';
      case 'image/jpeg': return 'JPEG — Compressed, smaller file';
      case 'image/webp': return 'WebP — Modern, optimal compression';
    }
  };

  const megapixels = ((dimensions.width * dimensions.height) / 1000000).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-neutral-950 border border-neutral-800/60 rounded-2xl overflow-hidden text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-sm">Export Image</h3>
              <p className="text-[10px] text-neutral-500">Native resolution output</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Resolution Badge */}
          <div className="p-3 rounded-lg bg-neutral-900/80 border border-neutral-800/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-neutral-400">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dimensions</span>
            </div>
            <span className="font-mono text-emerald-400">
              {dimensions.width} × {dimensions.height} ({megapixels} MP)
            </span>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Format
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['image/png', 'image/jpeg', 'image/webp'] as ExportFormat[]).map((fmt) => {
                const ext = fmt.split('/')[1].toUpperCase();
                const isSelected = format === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt)}
                    className={`py-2 px-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-neutral-800/50 bg-neutral-900/50 text-neutral-500 hover:bg-neutral-800/80 hover:text-neutral-300'
                    }`}
                  >
                    <span>{ext}</span>
                    {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-neutral-500">{getFormatLabel(format)}</p>
          </div>

          {/* Quality Slider (for JPEG / WebP) */}
          {format !== 'image/png' && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  Quality
                </label>
                <span className="font-mono text-emerald-400 text-[11px]">
                  {Math.round(quality * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.0"
                step="0.05"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-neutral-800/50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-all cursor-pointer"
          >
            {isExporting ? (
              <span className="animate-spin text-sm">⏳</span>
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isExporting ? 'Exporting...' : 'Save Image'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

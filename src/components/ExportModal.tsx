import React, { useState } from 'react';
import { Download, X, Image as ImageIcon, Sparkles, Check } from 'lucide-react';
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
      case 'image/png': return 'PNG (Lossless, High Quality)';
      case 'image/jpeg': return 'JPEG (Compressed, Smaller File)';
      case 'image/webp': return 'WebP (Modern, Optimal Compression)';
    }
  };

  const megapixels = ((dimensions.width * dimensions.height) / 1000000).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg leading-snug">Export High-Res Image</h3>
              <p className="text-xs text-slate-400">Preserves original native resolution</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Resolution Badge */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <ImageIcon className="w-4 h-4 text-indigo-400" />
              <span>Native Dimensions:</span>
            </div>
            <span className="font-mono font-medium text-indigo-300">
              {dimensions.width} × {dimensions.height} px ({megapixels} MP)
            </span>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Image Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['image/png', 'image/jpeg', 'image/webp'] as ExportFormat[]).map((fmt) => {
                const ext = fmt.split('/')[1].toUpperCase();
                const isSelected = format === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-md shadow-indigo-950/30'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span>{ext}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 pt-0.5">{getFormatLabel(format)}</p>
          </div>

          {/* Quality Slider (for JPEG / WebP) */}
          {format !== 'image/png' && (
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold uppercase tracking-wider text-slate-400">
                  Export Quality
                </label>
                <span className="font-mono text-indigo-400 font-medium">
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
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isExporting ? (
              <span className="animate-spin text-lg">⏳</span>
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isExporting ? 'Exporting...' : 'Save Image'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

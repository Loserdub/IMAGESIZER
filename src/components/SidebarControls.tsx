import React, { useRef } from 'react';
import { X, Sliders, Grid, Crosshair, Keyboard, Shield, ShieldCheck, Sparkles, Upload, Image as ImageIcon, Scan, Eye, Check } from 'lucide-react';
import { BrushSettings, SampleImage } from '../types/liquify';

interface SidebarControlsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BrushSettings;
  onUpdateSettings: (partial: Partial<BrushSettings>) => void;
  onResetMesh: () => void;
  onUploadImage?: (file: File) => void;
  sampleImages?: SampleImage[];
  onSelectSample?: (sample: SampleImage) => void;
  onAutoDetectBody?: () => void;
  isDetectingBody?: boolean;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onUploadImage,
  sampleImages,
  onSelectSample,
  onAutoDetectBody,
  isDetectingBody
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onUploadImage) {
      onUploadImage(e.target.files[0]);
    }
  };

  return (
    <aside className="fixed top-14 right-0 bottom-0 z-30 w-72 bg-neutral-950/98 border-l border-neutral-800/50 backdrop-blur-xl p-4 overflow-y-auto text-neutral-200 animate-slide-left">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800/50">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <h2 className="font-medium text-sm">Settings</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-5 pt-4">
        {/* Image Source & Upload */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
            Image Source
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 space-y-2.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Upload Custom Image</span>
            </button>

            {sampleImages && sampleImages.length > 0 && onSelectSample && (
              <div className="space-y-1">
                <span className="text-[10px] text-neutral-400">Preset Demo Images:</span>
                <select
                  onChange={(e) => {
                    const selected = sampleImages.find(s => s.id === e.target.value);
                    if (selected) onSelectSample(selected);
                  }}
                  className="w-full px-2 py-1.5 rounded-lg text-xs font-medium bg-neutral-950 text-neutral-300 border border-neutral-800 focus:outline-none focus:border-emerald-600 cursor-pointer"
                  defaultValue=""
                >
                  <option value="" disabled>Select Demo Image...</option>
                  {sampleImages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        {/* Protection Mask Settings */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            Protection Mask
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400">Show Mask Overlay</span>
              <button
                onClick={() => onUpdateSettings({ showMask: !settings.showMask })}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                  settings.showMask
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/40'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700/50'
                }`}
              >
                {settings.showMask ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Opacity</span>
                <span className="font-mono text-emerald-400 text-[11px]">{Math.round(settings.maskOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={settings.maskOpacity}
                onChange={(e) => onUpdateSettings({ maskOpacity: parseFloat(e.target.value) })}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Smart Background Guard (Zero Bent Walls) */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Smart Background Guard
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 space-y-3">
            {/* Auto Detect Body Button */}
            {onAutoDetectBody && (
              <button
                onClick={onAutoDetectBody}
                disabled={isDetectingBody}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer disabled:opacity-50"
              >
                <Scan className={`w-4 h-4 text-emerald-400 ${isDetectingBody ? 'animate-spin' : ''}`} />
                <span>{isDetectingBody ? 'Scanning Body Contours...' : 'Auto-Detect Body (AI)'}</span>
              </button>
            )}

            {/* Lock Background Toggle */}
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="text-neutral-300 font-medium">Lock Background</span>
                <p className="text-[10px] text-neutral-500">Zero bent walls or gym gear</p>
              </div>
              <button
                onClick={() => onUpdateSettings({ backgroundGuard: !settings.backgroundGuard })}
                className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                  settings.backgroundGuard
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700/50'
                }`}
              >
                {settings.backgroundGuard ? 'ACTIVE' : 'OFF'}
              </button>
            </div>

            {/* Mask Preview Toggle */}
            <div className="flex justify-between items-center text-xs pt-2 border-t border-neutral-800/50">
              <span className="text-neutral-400">Preview Cutout Mask</span>
              <button
                onClick={() => onUpdateSettings({ showSubjectMaskPreview: !settings.showSubjectMaskPreview })}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                  settings.showSubjectMaskPreview
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700/50'
                }`}
              >
                {settings.showSubjectMaskPreview ? 'SHOW' : 'HIDE'}
              </button>
            </div>

            {/* Edge Feather Softness */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Edge Feather</span>
                <span className="font-mono text-emerald-400 text-[11px]">{settings.backgroundGuardFeather}px</span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                step="1"
                value={settings.backgroundGuardFeather}
                onChange={(e) => onUpdateSettings({ backgroundGuardFeather: parseInt(e.target.value) })}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Touch Ergonomics Section */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
            Touch Ergonomics
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-400">Offset Distance</span>
              <span className="font-mono text-emerald-400 text-[11px]">{settings.touchOffset}px</span>
            </div>
            <input
              type="range"
              min="10"
              max="120"
              value={settings.touchOffset}
              onChange={(e) => onUpdateSettings({ touchOffset: parseInt(e.target.value) })}
              className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
            />
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Shifts brush focal point above touch contact so thumb does not cover the editing area.
            </p>
          </div>
        </div>

        {/* WebGL Mesh Grid Options */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <Grid className="w-3.5 h-3.5 text-emerald-400" />
            Mesh Grid
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 space-y-3">
            {/* Mesh Opacity */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Wireframe Opacity</span>
                <span className="font-mono text-emerald-400 text-[11px]">{Math.round(settings.meshOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.meshOpacity}
                onChange={(e) => onUpdateSettings({ meshOpacity: parseFloat(e.target.value) })}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>

            {/* Grid Density */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Resolution</span>
                <span className="font-mono text-emerald-400 text-[11px]">{settings.meshGridSize}×{settings.meshGridSize}</span>
              </div>
              <input
                type="range"
                min="60"
                max="200"
                step="20"
                value={settings.meshGridSize}
                onChange={(e) => onUpdateSettings({ meshGridSize: parseInt(e.target.value) })}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <p className="text-[10px] text-neutral-500">
                Higher resolution = finer detail precision.
              </p>
            </div>
          </div>
        </div>

        {/* Sculpting & Liquify Tips */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Sculpting Tips
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 text-xs space-y-2 text-neutral-400">
            <p><strong className="text-emerald-300">Swell (Bloat):</strong> Tap & hold or gently drag over biceps, shoulders, or curves to expand size outward.</p>
            <p><strong className="text-emerald-300">Push:</strong> Drag along muscle contours to shape and define curves smoothly.</p>
            <p><strong className="text-emerald-300">Pinch:</strong> Tap or drag over waists or contours to slim inward.</p>
            <p><strong className="text-rose-400">Freeze Mask:</strong> Paint adjacent areas (torso, background) to lock them while editing muscles.</p>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-amber-400" />
            Shortcuts
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 text-xs space-y-1.5">
            {[
              ['Compare Original', 'Space'],
              ['Undo', 'Ctrl+Z'],
              ['Redo', 'Ctrl+Y'],
              ['Push Tool', '1'],
              ['Swell Tool (Bloat)', '2'],
              ['Pinch Tool (Slim)', '3'],
              ['Restore / Eraser', '4'],
              ['Pan Viewport', '5'],
              ['Freeze Mask', '6'],
              ['Thaw / Unmask', '7']
            ].map(([label, key]) => (
              <div key={label} className="flex justify-between">
                <span className="text-neutral-500">{label}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-[10px] text-neutral-400">{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

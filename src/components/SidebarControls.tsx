import React from 'react';
import { X, Sliders, Grid, Crosshair, Keyboard, Shield } from 'lucide-react';
import { BrushSettings } from '../types/liquify';

interface SidebarControlsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BrushSettings;
  onUpdateSettings: (partial: Partial<BrushSettings>) => void;
  onResetMesh: () => void;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  if (!isOpen) return null;

  return (
    <aside className="fixed top-16 right-0 bottom-0 z-30 w-80 bg-slate-900/95 border-l border-slate-800 shadow-2xl backdrop-blur-xl p-5 overflow-y-auto text-slate-200 animate-slide-left">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-base">Engine Settings</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-6 pt-5">
        {/* Protection Mask Settings */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-rose-400" />
            Protection Mask Overlay
          </h3>
          <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300">Show Red Protection Mask</span>
              <button
                onClick={() => onUpdateSettings({ showMask: !settings.showMask })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                  settings.showMask
                    ? 'bg-rose-600/30 text-rose-300 border-rose-500/80'
                    : 'bg-slate-700/60 text-slate-400 border-slate-600/60'
                }`}
              >
                {settings.showMask ? 'ENABLED' : 'HIDDEN'}
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300">Mask Overlay Opacity</span>
                <span className="font-mono text-rose-400 font-medium">{Math.round(settings.maskOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={settings.maskOpacity}
                onChange={(e) => onUpdateSettings({ maskOpacity: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>
          </div>
        </div>
        {/* Touch Ergonomics Section */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Crosshair className="w-4 h-4 text-emerald-400" />
            Touch Ergonomics
          </h3>
          <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300">Offset Distance</span>
              <span className="font-mono text-indigo-400 font-medium">{settings.touchOffset} px</span>
            </div>
            <input
              type="range"
              min="10"
              max="120"
              value={settings.touchOffset}
              onChange={(e) => onUpdateSettings({ touchOffset: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <p className="text-[11px] text-slate-400 leading-normal">
              Shifts the active brush focal point above your finger touch coordinate so your thumb never hides the deformation area.
            </p>
          </div>
        </div>

        {/* WebGL Mesh Grid Options */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Grid className="w-4 h-4 text-indigo-400" />
            Deformation Mesh Grid
          </h3>
          <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-4">
            {/* Mesh Opacity */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300">Mesh Wireframe Opacity</span>
                <span className="font-mono text-indigo-400">{Math.round(settings.meshOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.meshOpacity}
                onChange={(e) => onUpdateSettings({ meshOpacity: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Grid Density */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300">Grid Resolution</span>
                <span className="font-mono text-indigo-400">{settings.meshGridSize} x {settings.meshGridSize}</span>
              </div>
              <input
                type="range"
                min="60"
                max="200"
                step="20"
                value={settings.meshGridSize}
                onChange={(e) => onUpdateSettings({ meshGridSize: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <p className="text-[10px] text-slate-400">
                Higher grid resolution increases precision on fine details.
              </p>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Keyboard className="w-4 h-4 text-amber-400" />
            Shortcuts
          </h3>
          <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Hold Compare</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-[10px]">Space</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Undo Stroke</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-[10px]">Ctrl + Z</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Redo Stroke</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-[10px]">Ctrl + Y</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Push / Swell / Pinch</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-[10px]">1 / 2 / 3</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Reconstruct / Pan</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-[10px]">4 / 5</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Freeze / Thaw Mask</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-[10px]">6 / 7</kbd>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

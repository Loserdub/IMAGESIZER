import React from 'react';
import { X, Sliders, Grid, Crosshair, Keyboard, Shield, Sparkles } from 'lucide-react';
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

        {/* Fluid Physics Options */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Fluid Physics
          </h3>
          <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/40 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Anti-Gravity</span>
                <span className="font-mono text-emerald-400 text-[11px]">{Math.round(settings.antiGravityIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={settings.antiGravityIntensity}
                onChange={(e) => onUpdateSettings({ antiGravityIntensity: parseFloat(e.target.value) })}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Viscosity</span>
                <span className="font-mono text-emerald-400 text-[11px]">{Math.round(settings.fluidViscosity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={settings.fluidViscosity}
                onChange={(e) => onUpdateSettings({ fluidViscosity: parseFloat(e.target.value) })}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Dissipation</span>
                <span className="font-mono text-emerald-400 text-[11px]">{Math.round(settings.velocityDissipation * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.9"
                max="1.0"
                step="0.01"
                value={settings.velocityDissipation}
                onChange={(e) => onUpdateSettings({ velocityDissipation: parseFloat(e.target.value) })}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>
            
            <div className="space-y-2 pt-1 border-t border-neutral-800/60">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Quality Preset</span>
              </div>
              <div className="flex gap-1.5 bg-neutral-950 p-1 rounded-lg">
                {[
                  { label: 'Fast', iters: 8 },
                  { label: 'Balanced', iters: 16 },
                  { label: 'Quality', iters: 32 }
                ].map(({ label, iters }) => (
                  <button
                    key={label}
                    onClick={() => onUpdateSettings({ pressureIterations: iters })}
                    className={`flex-1 text-[10px] py-1 rounded-md transition-colors ${
                      settings.pressureIterations === iters
                        ? 'bg-neutral-800 text-white font-medium'
                        : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
              ['Compare', 'Space'],
              ['Undo', 'Ctrl+Z'],
              ['Redo', 'Ctrl+Y'],
              ['Blast / Gravity / Vortex', '1 / 2 / 3'],
              ['Restore / Pan', '4 / 5'],
              ['Freeze / Thaw', '6 / 7']
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

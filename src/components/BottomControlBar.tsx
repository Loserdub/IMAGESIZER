import React from 'react';
import { 
  Move, 
  Hand, 
  Crosshair, 
  Sparkles,
  Maximize2,
  Minimize2,
  Shield,
  ShieldOff,
  ShieldCheck,
  Trash2,
  Droplet
} from 'lucide-react';
import { ToolMode, BrushSettings } from '../types/liquify';

interface BottomControlBarProps {
  toolMode: ToolMode;
  onSelectTool: (mode: ToolMode) => void;
  settings: BrushSettings;
  onUpdateSettings: (partial: Partial<BrushSettings>) => void;
  onClearMask?: () => void;
  onAutoDetectBody?: () => void;
  isDetectingBody?: boolean;
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  toolMode,
  onSelectTool,
  settings,
  onUpdateSettings,
  onClearMask,
  onAutoDetectBody,
  isDetectingBody
}) => {
  const tools: { id: ToolMode; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'push',        label: 'Push',        icon: <Move className="w-4 h-4" />,       shortcut: '1' },
    { id: 'swell',       label: 'Swell',       icon: <Maximize2 className="w-4 h-4" />,  shortcut: '2' },
    { id: 'pinch',       label: 'Pinch',       icon: <Minimize2 className="w-4 h-4" />,  shortcut: '3' },
    { id: 'smooth',      label: 'Smooth',      icon: <Droplet className="w-4 h-4" />,    shortcut: '4' },
    { id: 'reconstruct', label: 'Restore',     icon: <Sparkles className="w-4 h-4" />,   shortcut: '5' },
    { id: 'freeze',      label: 'Freeze',      icon: <Shield className="w-4 h-4" />,     shortcut: '6' },
    { id: 'thaw',        label: 'Thaw',        icon: <ShieldOff className="w-4 h-4" />,  shortcut: '7' },
    { id: 'pan',         label: 'Pan',         icon: <Hand className="w-4 h-4" />,       shortcut: '8' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-3 pointer-events-none">
      <div className="max-w-3xl mx-auto bg-neutral-950/95 border border-neutral-800/60 rounded-2xl backdrop-blur-xl pointer-events-auto p-2.5 space-y-2">

        {/* Sliders Bar */}
        {toolMode !== 'pan' && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-1">
              {/* Brush Size */}
              <div className="flex items-center gap-2.5 bg-neutral-900/80 px-3 py-1.5 rounded-lg border border-neutral-800/50">
                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider w-12 shrink-0">
                  Size
                </span>
                <input
                  type="range"
                  min="10"
                  max="300"
                  value={settings.size}
                  onChange={(e) => onUpdateSettings({ size: parseInt(e.target.value) })}
                  className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
                />
                <span className="text-[11px] font-mono text-emerald-400 w-10 text-right shrink-0">
                  {settings.size}px
                </span>
              </div>

              {/* Pressure / Strength */}
              <div className="flex items-center gap-2.5 bg-neutral-900/80 px-3 py-1.5 rounded-lg border border-neutral-800/50">
                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider w-12 shrink-0">
                  Force
                </span>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={settings.strength}
                  onChange={(e) => onUpdateSettings({ strength: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
                />
                <span className="text-[11px] font-mono text-emerald-400 w-10 text-right shrink-0">
                  {Math.round(settings.strength * 100)}%
                </span>
              </div>
            </div>

            {/* When Smooth tool is selected, show Quick Mode Selector & Softness Slider */}
            {toolMode === 'smooth' && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-cyan-950/25 rounded-lg border border-cyan-800/35 text-xs animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider pl-1">
                    Target:
                  </span>
                  {(['skin', 'contour', 'hybrid'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => onUpdateSettings({ smoothMode: m })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                        (settings.smoothMode ?? 'skin') === m
                          ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                          : 'text-neutral-400 hover:text-neutral-200 bg-neutral-900/60 border border-neutral-800'
                      }`}
                    >
                      {m === 'skin' ? 'Skin & Wrinkles' : m === 'contour' ? 'Contour Mesh' : 'Hybrid (Both)'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pl-2 border-l border-cyan-900/40">
                  <span className="text-[10px] text-neutral-400 whitespace-nowrap">Softness:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={settings.smoothSoftness ?? 0.6}
                    onChange={(e) => onUpdateSettings({ smoothSoftness: parseFloat(e.target.value) })}
                    className="w-20 sm:w-28 h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-cyan-400 w-8 text-right">
                    {Math.round((settings.smoothSoftness ?? 0.6) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Primary Controls Row: Tools & Touch Offset Toggle */}
        <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar">
          {/* Tool Modes */}
          <div className="flex items-center gap-1">
            {tools.map((t) => {
              const isSelected = toolMode === t.id;
              const isSmooth = t.id === 'smooth';
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTool(t.id)}
                  title={`${t.label} [${t.shortcut}]`}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? isSmooth
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                      : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/80 border border-transparent'
                  }`}
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Touch Offset & Mask Controls */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-800/50 shrink-0">
            {onClearMask && (
              <button
                onClick={onClearMask}
                title="Clear all freeze mask protection weights"
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Mask</span>
              </button>
            )}

            {/* Smart Background Guard Toggle */}
            <button
              onClick={() => {
                if (!settings.hasSubjectMask && onAutoDetectBody) {
                  onAutoDetectBody();
                } else {
                  onUpdateSettings({ backgroundGuard: !settings.backgroundGuard });
                }
              }}
              title={
                settings.backgroundGuard
                  ? 'Background Guard ON: Background lines & walls are locked straight'
                  : 'Background Guard OFF: Click to lock background from warping'
              }
              className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                settings.backgroundGuard
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'text-neutral-500 border-neutral-800/50 hover:bg-neutral-800/80 hover:text-neutral-300'
              }`}
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${settings.backgroundGuard ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'}`} />
              <span className="hidden sm:inline">Guard</span>
              <span className={`text-[10px] font-mono ${settings.backgroundGuard ? 'text-emerald-300 font-bold' : 'opacity-70'}`}>
                {isDetectingBody ? '...' : (settings.backgroundGuard ? 'ON' : 'OFF')}
              </span>
            </button>

            <button
              onClick={() => onUpdateSettings({ enableOffset: !settings.enableOffset })}
              title="Touch Offset: Places brush focal point above finger"
              className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                settings.enableOffset
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'text-neutral-500 border-neutral-800/50 hover:bg-neutral-800/80 hover:text-neutral-300'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Offset</span>
              <span className="text-[10px] font-mono opacity-70">
                {settings.enableOffset ? `${settings.touchOffset}px` : 'OFF'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

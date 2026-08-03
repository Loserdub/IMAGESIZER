import React from 'react';
import { 
  Move, 
  CircleDot, 
  Target, 
  RotateCcw, 
  Hand, 
  Sliders, 
  Crosshair, 
  Sparkles,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { ToolMode, BrushSettings } from '../types/liquify';

interface BottomControlBarProps {
  toolMode: ToolMode;
  onSelectTool: (mode: ToolMode) => void;
  settings: BrushSettings;
  onUpdateSettings: (partial: Partial<BrushSettings>) => void;
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  toolMode,
  onSelectTool,
  settings,
  onUpdateSettings
}) => {
  const tools: { id: ToolMode; label: string; icon: React.ReactNode; desc: string }[] = [
    { 
      id: 'push', 
      label: 'Push / Drag', 
      icon: <Move className="w-5 h-5" />, 
      desc: 'Moves pixels smoothly in swipe direction' 
    },
    { 
      id: 'swell', 
      label: 'Swell / Bloat', 
      icon: <Maximize2 className="w-5 h-5" />, 
      desc: 'Expands pixels outward from center' 
    },
    { 
      id: 'pinch', 
      label: 'Pinch / Shrink', 
      icon: <Minimize2 className="w-5 h-5" />, 
      desc: 'Pulls pixels inward toward center' 
    },
    { 
      id: 'reconstruct', 
      label: 'Reconstruct', 
      icon: <Sparkles className="w-5 h-5" />, 
      desc: 'Paints back original un-distorted image' 
    },
    { 
      id: 'pan', 
      label: 'Pan & Zoom', 
      icon: <Hand className="w-5 h-5" />, 
      desc: 'Navigate canvas view' 
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-3 md:p-4 pointer-events-none">
      <div className="max-w-4xl mx-auto bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl pointer-events-auto p-3 space-y-3">
        
        {/* Sliders Bar */}
        {toolMode !== 'pan' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1">
            {/* Brush Size */}
            <div className="flex items-center gap-3 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/40">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-16 shrink-0">
                Size
              </span>
              <input
                type="range"
                min="10"
                max="300"
                value={settings.size}
                onChange={(e) => onUpdateSettings({ size: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-xs font-mono font-medium text-indigo-300 w-12 text-right shrink-0">
                {settings.size}px
              </span>
            </div>

            {/* Pressure / Strength */}
            <div className="flex items-center gap-3 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/40">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-16 shrink-0">
                Strength
              </span>
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                value={settings.strength}
                onChange={(e) => onUpdateSettings({ strength: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-xs font-mono font-medium text-indigo-300 w-12 text-right shrink-0">
                {Math.round(settings.strength * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Primary Controls Row: Tools & Touch Offset Toggle */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
          {/* Tool Modes */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {tools.map((t) => {
              const isSelected = toolMode === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTool(t.id)}
                  title={`${t.label}: ${t.desc}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30 scale-[1.02]'
                      : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/50'
                  }`}
                >
                  {t.icon}
                  <span className="hidden xs:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Touch Offset Reticle Toggle */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800 shrink-0">
            <button
              onClick={() => onUpdateSettings({ enableOffset: !settings.enableOffset })}
              title="Touch Offset: Places brush focal point above finger so thumb does not cover the editing area."
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                settings.enableOffset
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/80 shadow-md shadow-emerald-950/40'
                  : 'bg-slate-800/70 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Crosshair className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Touch Offset</span>
              <span className="text-[10px] font-mono opacity-80">
                {settings.enableOffset ? `${settings.touchOffset}px` : 'OFF'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

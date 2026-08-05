import React from 'react';
import { 
  Sparkles, 
  Undo2, 
  Redo2, 
  Eye, 
  Grid, 
  Download, 
  Upload, 
  Sliders,
  RotateCcw
} from 'lucide-react';
import { SampleImage } from '../types/liquify';

interface HeaderProps {
  sampleImages: SampleImage[];
  onSelectSample: (sample: SampleImage) => void;
  onUploadImage: (file: File) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  isComparing: boolean;
  onCompareStart: () => void;
  onCompareEnd: () => void;
  showMesh: boolean;
  onToggleMesh: () => void;
  onOpenExport: () => void;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  sampleImages,
  onSelectSample,
  onUploadImage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  isComparing,
  onCompareStart,
  onCompareEnd,
  showMesh,
  onToggleMesh,
  onOpenExport,
  onToggleSidebar
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(e.target.files[0]);
    }
  };

  return (
    <header className="h-14 px-4 md:px-5 bg-neutral-950/95 border-b border-emerald-900/30 backdrop-blur-xl flex items-center justify-between z-30 shrink-0 select-none">
      {/* Left: Branding & Upload */}
      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-semibold text-sm md:text-[15px] tracking-tight text-neutral-100">
              ImageSizer <span className="text-emerald-400 font-normal text-xs">Liquify</span>
            </h1>
            <p className="hidden md:block text-[10px] text-neutral-500 -mt-0.5">
              WebGL Warp & Distortion Engine
            </p>
          </div>
        </div>

        {/* Upload & Sample Selector */}
        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-neutral-800/60">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Upload</span>
          </button>

          {/* Sample selector */}
          <select
            onChange={(e) => {
              const selected = sampleImages.find(s => s.id === e.target.value);
              if (selected) onSelectSample(selected);
            }}
            className="px-2 py-1.5 rounded-lg text-xs font-medium bg-neutral-900 text-neutral-400 border border-neutral-800 focus:outline-none focus:border-emerald-600 cursor-pointer"
            defaultValue=""
          >
            <option value="" disabled>Demo...</option>
            {sampleImages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center: History & Hold to Compare */}
      <div className="flex items-center gap-1">
        {/* Undo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Redo */}
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          title="Reset to Original Image"
          className="p-2 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800/80 transition-all cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-neutral-800 mx-1.5" />

        {/* Hold to Compare */}
        <button
          onMouseDown={onCompareStart}
          onMouseUp={onCompareEnd}
          onMouseLeave={onCompareEnd}
          onTouchStart={onCompareStart}
          onTouchEnd={onCompareEnd}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
            isComparing
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60'
              : 'bg-transparent text-neutral-400 border-neutral-800 hover:bg-neutral-800/80 hover:text-neutral-200'
          }`}
          title="Hold Spacebar or mouse to compare with original image"
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Compare</span>
        </button>
      </div>

      {/* Right: Mesh Toggle, Export, Sidebar */}
      <div className="flex items-center gap-1.5">
        {/* Mesh Grid Overlay Toggle */}
        <button
          onClick={onToggleMesh}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
            showMesh
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50'
              : 'bg-transparent text-neutral-500 border-neutral-800 hover:bg-neutral-800/80 hover:text-neutral-300'
          }`}
          title="Toggle Wireframe Mesh Grid Overlay"
        >
          <Grid className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Grid</span>
        </button>

        {/* High-Res Export */}
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        {/* Desktop Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/80 md:flex hidden transition-all cursor-pointer"
          title="Settings Sidebar"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LiquifyEngine } from './engine/LiquifyEngine';
import { LiquifyCanvas } from './components/LiquifyCanvas';
import { Header } from './components/Header';
import { BottomControlBar } from './components/BottomControlBar';
import { ExportModal } from './components/ExportModal';
import { SidebarControls } from './components/SidebarControls';
import { getSampleImages } from './data/sampleImages';
import { ToolMode, BrushSettings, ExportSettings, ImageDimensions, SampleImage } from './types/liquify';
import { segmentSubject } from './services/segmentationService';

export default function App() {
  const sampleImages = useRef<SampleImage[]>(getSampleImages()).current;

  // Active Image
  const [imageSrc, setImageSrc] = useState<string>(sampleImages[0].url);
  const [imageDims, setImageDims] = useState<ImageDimensions>({ width: 1200, height: 1600 });

  // Tool & Settings State
  const [toolMode, setToolMode] = useState<ToolMode>('push');
  const [settings, setSettings] = useState<BrushSettings>({
    size: 90,
    strength: 0.5,
    touchOffset: 45,
    enableOffset: false,
    meshOverlay: false,
    meshGridSize: 120,
    meshOpacity: 0.5,
    meshColor: '#10b981',
    showMask: true,
    maskOpacity: 0.35,
    maskColor: '#ef4444',
    backgroundGuard: false,
    backgroundGuardFeather: 4,
    showSubjectMaskPreview: false,
    hasSubjectMask: false
  });

  // Background Guard State
  const [isDetectingBody, setIsDetectingBody] = useState(false);

  // History & Compare State
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  // Modals & Drawers
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Ref to Engine
  const engineRef = useRef<LiquifyEngine | null>(null);

  const updateHistoryState = useCallback(() => {
    if (engineRef.current) {
      setCanUndo(engineRef.current.canUndo());
      setCanRedo(engineRef.current.canRedo());
    }
  }, []);

  // Handlers
  const handleUndo = () => {
    if (engineRef.current && engineRef.current.undo()) {
      updateHistoryState();
    }
  };

  const handleRedo = () => {
    if (engineRef.current && engineRef.current.redo()) {
      updateHistoryState();
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.reset();
      updateHistoryState();
    }
  };

  const handleCompareStart = () => {
    setIsComparing(true);
    if (engineRef.current) {
      engineRef.current.setComparing(true);
    }
  };

  const handleCompareEnd = () => {
    setIsComparing(false);
    if (engineRef.current) {
      engineRef.current.setComparing(false);
    }
  };

  const handleUploadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setImageSrc(e.target.result as string);
        setSettings(s => ({ ...s, hasSubjectMask: false, backgroundGuard: false }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectSample = (sample: SampleImage) => {
    setImageSrc(sample.url);
    setSettings(s => ({ ...s, hasSubjectMask: false, backgroundGuard: false }));
  };

  const handleAutoDetectBody = async (feather?: number) => {
    if (!engineRef.current || isDetectingBody) return;
    const currentImg = engineRef.current.getImage();
    if (!currentImg) return;

    setIsDetectingBody(true);
    try {
      const radius = feather ?? settings.backgroundGuardFeather ?? 4;
      const segResult = await segmentSubject(currentImg, radius);
      engineRef.current.setSubjectMask(segResult.maskCanvas);
      setSettings(s => ({
        ...s,
        backgroundGuard: true,
        hasSubjectMask: true,
      }));
    } catch (err) {
      console.error('Failed to segment subject body:', err);
    } finally {
      setIsDetectingBody(false);
    }
  };

  const handleToggleBackgroundGuard = () => {
    if (!settings.hasSubjectMask) {
      handleAutoDetectBody();
    } else {
      setSettings(s => ({ ...s, backgroundGuard: !s.backgroundGuard }));
    }
  };

  const handleExport = async (exportSettings: ExportSettings) => {
    if (!engineRef.current) return;
    const blob = await engineRef.current.exportHighRes(exportSettings);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = exportSettings.format.split('/')[1];
    a.download = `ImageSizer-Liquify-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearMask = () => {
    if (engineRef.current) {
      engineRef.current.clearMask();
      updateHistoryState();
    }
  };

  // Keep settings updated in the engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateSettings(settings);
    }
  }, [settings]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handleCompareStart();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === '1') setToolMode('push');
      else if (e.key === '2') setToolMode('swell');
      else if (e.key === '3') setToolMode('pinch');
      else if (e.key === '4') setToolMode('reconstruct');
      else if (e.key === '5') setToolMode('pan');
      else if (e.key === '6') setToolMode('freeze');
      else if (e.key === '7') setToolMode('thaw');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleCompareEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans select-none">
      {/* Top Navigation Header */}
      <Header
        sampleImages={sampleImages}
        onSelectSample={handleSelectSample}
        onUploadImage={handleUploadImage}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onReset={handleReset}
        isComparing={isComparing}
        onCompareStart={handleCompareStart}
        onCompareEnd={handleCompareEnd}
        showMesh={settings.meshOverlay}
        onToggleMesh={() => setSettings(s => ({ ...s, meshOverlay: !s.meshOverlay }))}
        onOpenExport={() => setIsExportOpen(true)}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        onAutoDetectBody={handleAutoDetectBody}
        isDetectingBody={isDetectingBody}
        hasSubjectMask={settings.hasSubjectMask}
        backgroundGuard={settings.backgroundGuard}
        onToggleBackgroundGuard={handleToggleBackgroundGuard}
      />

      {/* Main Canvas Viewport Area */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        <LiquifyCanvas
          imageSrc={imageSrc}
          toolMode={toolMode}
          settings={settings}
          engineRef={engineRef}
          onHistoryChange={updateHistoryState}
          onImageLoaded={setImageDims}
          onUploadImage={handleUploadImage}
        />

        {/* Sidebar Controls Drawer */}
        <SidebarControls
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          settings={settings}
          onUpdateSettings={(partial) => setSettings(s => ({ ...s, ...partial }))}
          onResetMesh={handleReset}
          onUploadImage={handleUploadImage}
          sampleImages={sampleImages}
          onSelectSample={handleSelectSample}
          onAutoDetectBody={handleAutoDetectBody}
          isDetectingBody={isDetectingBody}
        />
      </main>

      {/* Sticky Bottom Control Bar */}
      <BottomControlBar
        toolMode={toolMode}
        onSelectTool={setToolMode}
        settings={settings}
        onUpdateSettings={(partial) => setSettings(s => ({ ...s, ...partial }))}
        onClearMask={handleClearMask}
        onAutoDetectBody={handleAutoDetectBody}
        isDetectingBody={isDetectingBody}
      />

      {/* High Resolution Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={handleExport}
        dimensions={imageDims}
      />
    </div>
  );
}

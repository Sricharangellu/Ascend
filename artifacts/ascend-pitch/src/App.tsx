/**
 * Platform contract file — do not restructure.
 *
 * This file is part of the contract between the slides artifact and
 * the surrounding workspace tooling (preview, thumbnails, exports).
 * Reorganizing it, swapping the router, or changing the structure
 * of `AllSlides` can quietly break that tooling even when the page
 * still looks correct in the preview.
 *
 * Agents: see the slides skill `<workspace_contract>` for the full
 * rules, and `references/visual_qa.md` → "Platform contract sanity
 * check" if this file has been hand-edited and needs repair.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { slides } from '@/slideLoader';
import type { Action } from '@/.sdm/core/schema';
import { useLocation } from 'wouter';
import type { ExportProgress } from '@/lib/exportPdf';
import PresenterView from '@/pages/PresenterView';

function getSlideIndex(pathname: string): number {
  const match = pathname.match(/^\/slide(\d+)$/);
  if (!match) return -1;
  const position = parseInt(match[1], 10);
  return slides.findIndex((s) => s.position === position);
}

const PARENT_OWNS_NAVIGATION =
  new URLSearchParams(window.location.search).get('replitNav') === 'parent' ||
  window.parent !== window.parent.parent;

function SlideEditor() {
  const [location, navigate] = useLocation();
  const currentIndex = getSlideIndex(location);

  const navigationDisabledRef = useRef(PARENT_OWNS_NAVIGATION);
  const touchHandledRefStable = useRef(false);

  // Track navigation direction for animated transitions
  const prevIndexRef = useRef(currentIndex);
  const [enterDir, setEnterDir] = useState<'right' | 'left' | null>(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (currentIndex !== prevIndexRef.current) {
      setEnterDir(currentIndex > prevIndexRef.current ? 'right' : 'left');
      setAnimKey((k) => k + 1);
      prevIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  useEffect(() => {
    if (currentIndex === -1) return;

    const INTERACTIVE =
      'a,button,video,audio,input,select,textarea,details,summary,iframe,svg,canvas,' +
      '[role="button"],[contenteditable]:not([contenteditable="false"])';

    const isInteractive = (target: EventTarget | null) =>
      (target as HTMLElement | null)?.closest?.(INTERACTIVE);

    const ARROW_KEY_CONSUMERS =
      'input:not([type="button"]):not([type="submit"]):not([type="reset"]),' +
      'select,textarea,audio,video';

    const consumesArrowKeys = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable || !!target.closest(ARROW_KEY_CONSUMERS)
      );
    };

    const postNav = (type: 'advanceSlide' | 'retreatSlide') => {
      window.parent.postMessage({ type, source: 'keyboard' }, '*');
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (navigationDisabledRef.current) {
        if (event.defaultPrevented) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        if (event.key === ' ') {
          const focused = isInteractive(event.target);
          const role = focused?.getAttribute('role');
          const isPlainLink =
            !!focused &&
            focused.tagName === 'A' &&
            (!role ||
              role === 'link' ||
              role === 'none' ||
              role === 'presentation');
          if (focused && !isPlainLink) return;
          event.preventDefault();
          postNav('advanceSlide');
          return;
        }
        if (consumesArrowKeys(event.target)) return;
        if (
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowUp' ||
          event.key === 'PageUp'
        ) {
          event.preventDefault();
          postNav('retreatSlide');
        }
        if (
          event.key === 'ArrowRight' ||
          event.key === 'ArrowDown' ||
          event.key === 'PageDown'
        ) {
          event.preventDefault();
          postNav('advanceSlide');
        }
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
      }
      if (
        (event.key === 'ArrowLeft' ||
          event.key === 'ArrowUp' ||
          event.key === 'PageUp') &&
        currentIndex > 0
      ) {
        navigate(`/slide${slides[currentIndex - 1].position}`);
      }
      if (
        (event.key === 'ArrowRight' ||
          event.key === 'ArrowDown' ||
          event.key === 'PageDown' ||
          event.key === ' ') &&
        currentIndex < slides.length - 1
      ) {
        navigate(`/slide${slides[currentIndex + 1].position}`);
      }
    };

    const touchHandledRef = touchHandledRefStable;

    const onClick = (event: MouseEvent) => {
      if (touchHandledRef.current) {
        touchHandledRef.current = false;
        return;
      }
      if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
      if (isInteractive(event.target)) return;

      if (navigationDisabledRef.current) {
        window.parent.postMessage({ type: 'advanceSlide' }, '*');
        return;
      }

      if (currentIndex < slides.length - 1) {
        navigate(`/slide${slides[currentIndex + 1].position}`);
      }
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchTarget: EventTarget | null = null;

    const onTouchStart = (event: TouchEvent) => {
      touchHandledRef.current = false;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchTarget = event.target;
    };

    const onTouchEnd = (event: TouchEvent) => {
      const dx = event.changedTouches[0].clientX - touchStartX;
      const dy = event.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) >= 10 || Math.abs(dy) >= 10) return;
      if (isInteractive(touchTarget)) return;
      touchHandledRef.current = true;

      if (navigationDisabledRef.current) {
        window.parent.postMessage({ type: 'advanceSlide' }, '*');
        return;
      }

      const fraction = touchStartX / window.innerWidth;
      if (fraction < 0.4 && currentIndex > 0) {
        navigate(`/slide${slides[currentIndex - 1].position}`);
      } else if (fraction >= 0.4 && currentIndex < slides.length - 1) {
        navigate(`/slide${slides[currentIndex + 1].position}`);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClick);
    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClick);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [currentIndex, navigate]);

  // Listen for presenter-mode navigation via BroadcastChannel.
  // Only the explicit audience popup (audienceMode=1) participates —
  // preview iframes inside the presenter view must NOT join this channel.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('audienceMode') !== '1') return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('ascend-pitch-sync');
      bc.postMessage({ type: 'audienceReady' });
      bc.onmessage = (e) => {
        if (
          e.data?.type === 'navigateToSlide' &&
          typeof e.data.position === 'number'
        ) {
          const target = slides.find((s) => s.position === e.data.position);
          if (target) navigate(`/slide${target.position}`);
        }
      };
    } catch {}
    return () => {
      bc?.close();
    };
  }, [navigate]);

  return (
    <div className="select-none" style={{ overflow: 'hidden' }}>
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          style={{ display: index === currentIndex ? 'block' : 'none' }}
        >
          {index === currentIndex ? (
            <div key={animKey} className={enterDir ? `slide-enter-${enterDir}` : ''}>
              <slide.Component />
            </div>
          ) : (
            <slide.Component />
          )}
        </div>
      ))}
    </div>
  );
}

// Do not rewrite this component. Each slide must remain wrapped in
// `<div className="slide">` sized 1920×1080 — the class name and
// dimensions are part of the platform contract. See the file-level
// banner above for context.
function AllSlides() {
  return (
    <div className="bg-black">
      {slides.map((slide) => (
        <div
          key={slide.id}
          data-slide-id={slide.id}
          className="slide relative aspect-video overflow-hidden"
          style={{ width: '1920px', height: '1080px' }}
        >
          <div className="h-full w-full [&_.h-screen]:!h-full [&_.w-screen]:!w-full">
            <slide.Component />
          </div>
        </div>
      ))}
    </div>
  );
}

// This component is used for the deployed view at `/`
function SlideViewer() {
  const [, navigate] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [dims, setDims] = useState(() => ({
    width: Math.min(window.innerWidth, window.innerHeight * (16 / 9)),
    height: Math.min(window.innerHeight, window.innerWidth * (9 / 16)),
  }));
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const update = () => {
      setDims({
        width: Math.min(window.innerWidth, window.innerHeight * (16 / 9)),
        height: Math.min(window.innerHeight, window.innerWidth * (9 / 16)),
      });
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
        event.key !== 'PageUp' &&
        event.key !== 'PageDown' &&
        event.key !== ' '
      )
        return;
      if (event.key === ' ') event.preventDefault();
      iframeRef.current?.contentWindow?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: event.key,
          code: event.code,
          bubbles: true,
        }),
      );
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleExport = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (exporting) return;
    setExporting(true);
    setExportProgress({ current: 0, total: slides.length, label: 'Preparing…' });
    try {
      const { exportToPdf } = await import('@/lib/exportPdf');
      await exportToPdf((progress) => setExportProgress(progress));
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [exporting]);

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const firstPosition = slides.length > 0 ? slides[0].position : 1;

  return (
    <div
      className="slide-viewer h-screen w-screen overflow-hidden bg-black flex items-center justify-center"
      onClick={() => iframeRef.current?.focus()}
    >
      <iframe
        ref={iframeRef}
        src={`${base}/slide${firstPosition}`}
        style={{ width: dims.width, height: dims.height, border: 'none' }}
        onLoad={() => iframeRef.current?.focus()}
        title="Slide viewer"
      />

      {/* Presenter mode button — top-right corner overlay */}
      <button
        onClick={(e) => { e.stopPropagation(); navigate('/present'); }}
        title="Open presenter mode"
        style={{
          position: 'fixed',
          top: '16px',
          right: '176px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.08)',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        Present
      </button>

      {/* Download PDF button — top-right corner overlay */}
      <button
        onClick={handleExport}
        disabled={exporting}
        title="Download PDF"
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(93,95,239,0.4)',
          background: exporting ? 'rgba(10,13,23,0.95)' : 'rgba(93,95,239,0.15)',
          color: exporting ? 'rgba(255,255,255,0.6)' : '#fff',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
          cursor: exporting ? 'default' : 'pointer',
          backdropFilter: 'blur(8px)',
          transition: 'background 0.15s, color 0.15s',
          whiteSpace: 'nowrap',
          minWidth: '140px',
          justifyContent: 'center',
        }}
      >
        {exporting ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            {exportProgress
              ? `${exportProgress.current}/${exportProgress.total} slides`
              : 'Starting…'}
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download PDF
          </>
        )}
      </button>
    </div>
  );
}

export default function App() {
  const [location, navigate] = useLocation();

  // DO NOT edit this useEffect - redirects unknown routes to the first slide.
  // The "/", "/allslides", and "/present" routes are handled separately below.
  useEffect(() => {
    if (
      location !== '/' &&
      location !== '/allslides' &&
      location !== '/present' &&
      getSlideIndex(location) === -1
    ) {
      if (slides.length > 0) {
        navigate(`/slide${slides[0].position}`, { replace: true });
      }
    }
  }, [location, navigate]);

  // DO NOT edit this useEffect - allows the parent frame to navigate
  // between slides via postMessage so it can avoid changing the iframe
  // src (which causes a white flash).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'navigateToSlide' &&
        typeof event.data.position === 'number' &&
        slides.some((s) => s.position === event.data.position)
      ) {
        navigate(`/slide${event.data.position}`);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== 'sdm:action') {
        return;
      }
      const action = event.data.action as Action | undefined;
      if (!action) {
        return;
      }
      if (action.kind === 'goToSlide') {
        const target = slides.find((slide) => slide.id === action.slideId);
        if (target) {
          navigate(`/slide${target.position}`);
        }
        return;
      }
      if (action.kind !== 'goToRelativeSlide') {
        return;
      }
      if (
        PARENT_OWNS_NAVIGATION &&
        (action.target === 'next' || action.target === 'previous')
      ) {
        window.parent.postMessage(
          {
            type: action.target === 'next' ? 'advanceSlide' : 'retreatSlide',
            source: 'keyboard',
          },
          '*',
        );
        return;
      }
      const current = getSlideIndex(location);
      let targetIndex = current - 1;
      if (action.target === 'first') {
        targetIndex = 0;
      } else if (action.target === 'last') {
        targetIndex = slides.length - 1;
      } else if (action.target === 'next') {
        targetIndex = current + 1;
      }
      const target = slides[targetIndex];
      if (target) {
        navigate(`/slide${target.position}`);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [location, navigate]);

  if (location === '/') return <SlideViewer />;
  if (location === '/allslides') return <AllSlides />;
  if (location === '/present') return <PresenterView />;
  return <SlideEditor />;
}

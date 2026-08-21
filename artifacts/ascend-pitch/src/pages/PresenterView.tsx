import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { slides } from '@/slideLoader';

const CHANNEL_NAME = 'ascend-pitch-sync';
const NOTE_KEY_PREFIX = 'ascend-pitch-note-';

function getNoteKey(slideId: string) {
  return `${NOTE_KEY_PREFIX}${slideId}`;
}

function loadNote(slide: (typeof slides)[0]): string {
  try {
    const stored = localStorage.getItem(getNoteKey(slide.id));
    if (stored !== null) return stored;
  } catch {}
  return slide.speakerNotes ?? '';
}

function saveNote(slideId: string, text: string) {
  try {
    localStorage.setItem(getNoteKey(slideId), text);
  } catch {}
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PresenterView() {
  const [, navigate] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(slides.map((s) => [s.id, loadNote(s)])),
  );
  const [elapsed, setElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [hasAudience, setHasAudience] = useState(false);

  const audienceWindowRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref so the audienceReady handler always sees the latest currentIndex
  // regardless of when the audience window connects relative to slide changes.
  const currentIndexRef = useRef(currentIndex);

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  // Keep ref in sync with state
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Set up BroadcastChannel — presenter side only, never inside audience/preview iframes
  useEffect(() => {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = bc;
    bc.onmessage = (e) => {
      if (e.data?.type === 'audienceReady') {
        setHasAudience(true);
        // Use ref so we send the slide the presenter is on RIGHT NOW,
        // not the slide from the time this effect was first set up.
        bc.postMessage({ type: 'navigateToSlide', position: slides[currentIndexRef.current]?.position });
      }
    };
    return () => {
      bc.close();
      channelRef.current = null;
    };
  }, []);

  // Broadcast navigation whenever slide changes
  useEffect(() => {
    const slide = slides[currentIndex];
    if (!slide) return;
    channelRef.current?.postMessage({ type: 'navigateToSlide', position: slide.position });
    // Also try direct postMessage if we have a reference
    const aw = audienceWindowRef.current;
    if (aw && !aw.closed) {
      aw.postMessage({ type: 'navigateToSlide', position: slide.position }, '*');
    }
  }, [currentIndex]);

  // Timer
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    setCurrentIndex(clamped);
    if (!timerRunning && clamped !== 0) setTimerRunning(true);
  }, [timerRunning]);

  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const handleNoteChange = useCallback((slideId: string, text: string) => {
    setNotes((prev) => ({ ...prev, [slideId]: text }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNote(slideId, text), 400);
  }, []);

  const launchAudienceView = useCallback(() => {
    const slide = slides[currentIndex];
    const url = `${base}/slide${slide?.position ?? 1}?audienceMode=1`;
    const popup = window.open(url, 'ascend-audience', 'width=1280,height=720,toolbar=0,menubar=0,scrollbars=0');
    if (popup) {
      audienceWindowRef.current = popup;
      setHasAudience(true);
      // Give it a moment to load then send navigation
      setTimeout(() => {
        popup.postMessage({ type: 'navigateToSlide', position: slide?.position ?? 1 }, '*');
      }, 1200);
    }
  }, [currentIndex, base]);

  const currentSlide = slides[currentIndex];
  const nextSlide = slides[currentIndex + 1] ?? null;
  const currentNote = currentSlide ? (notes[currentSlide.id] ?? '') : '';

  // Iframe src for previews
  const slideIframeSrc = currentSlide ? `${base}/slide${currentSlide.position}?replitNav=parent` : '';
  const nextIframeSrc = nextSlide ? `${base}/slide${nextSlide.position}?replitNav=parent` : '';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#08090F',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: '52px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            title="Exit presenter mode"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Exit
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Presenter Mode
          </span>
        </div>

        {/* Slide counter */}
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          Slide <span style={{ color: '#fff', fontWeight: 700 }}>{currentIndex + 1}</span> / {slides.length}
          {currentSlide && (
            <span style={{ marginLeft: 10, color: 'rgba(255,255,255,0.35)' }}>
              — {currentSlide.title}
            </span>
          )}
        </div>

        {/* Timer + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 20,
              fontWeight: 700,
              color: elapsed > 0 ? (elapsed >= 1800 ? '#f87171' : elapsed >= 1200 ? '#fbbf24' : '#4ade80') : 'rgba(255,255,255,0.3)',
              letterSpacing: '0.05em',
              minWidth: 70,
              textAlign: 'right',
            }}
          >
            {formatTime(elapsed)}
          </div>
          <button
            onClick={() => setTimerRunning((r) => !r)}
            title={timerRunning ? 'Pause timer' : 'Start timer'}
            style={{
              background: timerRunning ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)',
              border: `1px solid ${timerRunning ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
              color: timerRunning ? '#f87171' : '#4ade80',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {timerRunning ? 'Pause' : 'Start'}
          </button>
          <button
            onClick={() => { setElapsed(0); setTimerRunning(false); }}
            title="Reset timer"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.4)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          <button
            onClick={launchAudienceView}
            style={{
              background: hasAudience ? 'rgba(93,95,239,0.2)' : 'rgba(93,95,239,0.85)',
              border: '1px solid rgba(93,95,239,0.6)',
              color: '#fff',
              borderRadius: 7,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            {hasAudience ? 'Re-launch Audience View' : 'Launch Audience View'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          gap: 0,
        }}
      >
        {/* Left panel — current slide preview + navigation */}
        <div
          style={{
            flex: '0 0 62%',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 16px 20px 20px',
            gap: 16,
            overflow: 'hidden',
          }}
        >
          {/* Slide preview */}
          <div
            style={{
              flex: 1,
              background: '#000',
              borderRadius: 10,
              overflow: 'hidden',
              position: 'relative',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {currentSlide ? (
              <iframe
                key={currentSlide.id}
                src={slideIframeSrc}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                  pointerEvents: 'none',
                }}
                title={`Slide ${currentIndex + 1} preview`}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)' }}>
                No slides
              </div>
            )}
          </div>

          {/* Navigation controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              style={{
                background: currentIndex === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: currentIndex === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
                borderRadius: 8,
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: currentIndex === 0 ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Prev
            </button>

            {/* Slide dots */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => goTo(i)}
                  title={`Go to slide ${i + 1}: ${s.title}`}
                  style={{
                    width: i === currentIndex ? 20 : 7,
                    height: 7,
                    borderRadius: 4,
                    background: i === currentIndex ? '#5D5FEF' : 'rgba(255,255,255,0.2)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'width 0.2s, background 0.2s',
                  }}
                />
              ))}
            </div>

            <button
              onClick={goNext}
              disabled={currentIndex === slides.length - 1}
              style={{
                background: currentIndex === slides.length - 1 ? 'rgba(255,255,255,0.03)' : 'rgba(93,95,239,0.85)',
                border: '1px solid rgba(93,95,239,0.5)',
                color: currentIndex === slides.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff',
                borderRadius: 8,
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: currentIndex === slides.length - 1 ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.15s',
              }}
            >
              Next
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right panel — notes + next slide */}
        <div
          style={{
            flex: '0 0 38%',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Next slide preview */}
          <div
            style={{
              flexShrink: 0,
              padding: '20px 20px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 8,
              }}
            >
              Up Next
            </div>
            {nextSlide ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  style={{
                    width: 160,
                    aspectRatio: '16/9',
                    background: '#000',
                    borderRadius: 6,
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.08)',
                    position: 'relative',
                  }}
                >
                  <iframe
                    key={nextSlide.id}
                    src={nextIframeSrc}
                    style={{
                      width: '1920px',
                      height: '1080px',
                      border: 'none',
                      display: 'block',
                      transform: 'scale(0.0833)',
                      transformOrigin: 'top left',
                      pointerEvents: 'none',
                    }}
                    title={`Next slide preview: ${nextSlide.title}`}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 3 }}>
                    {currentIndex + 2}. {nextSlide.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>
                    {nextSlide.description}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                End of presentation
              </div>
            )}
          </div>

          {/* Speaker notes */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '16px 20px 20px',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Speaker Notes</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                Auto-saved locally
              </span>
            </div>
            {currentSlide ? (
              <textarea
                value={currentNote}
                onChange={(e) => handleNoteChange(currentSlide.id, e.target.value)}
                placeholder="Add your talking points here…"
                style={{
                  flex: 1,
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  lineHeight: 1.65,
                  padding: '12px 14px',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  boxSizing: 'border-box',
                  minHeight: 0,
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(93,95,239,0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

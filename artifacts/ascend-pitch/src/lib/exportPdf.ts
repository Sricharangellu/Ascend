import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { slides } from '@/slideLoader';

export type ExportProgress = {
  current: number;
  total: number;
  label: string;
};

/**
 * Render a slide component into a hidden 1920×1080 off-screen container,
 * capture it with html2canvas, and return a data-URL PNG.
 */
async function captureSlide(
  SlideComponent: React.ComponentType,
): Promise<string> {
  // Off-screen container sized exactly 1920×1080 so the slide renders
  // at its intended resolution. Uses the same overrides as AllSlides.
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-19200px;top:0;width:1920px;height:1080px;' +
    'overflow:hidden;z-index:-9999;pointer-events:none;';
  document.body.appendChild(host);

  // Inner wrapper replicates the AllSlides override:
  // force .h-screen → full container height, .w-screen → full container width
  const inner = document.createElement('div');
  inner.className = 'h-full w-full';
  inner.style.cssText = 'width:1920px;height:1080px;overflow:hidden;';
  host.appendChild(inner);

  // Render the slide component
  const root = createRoot(inner);
  root.render(
    createElement(
      'div',
      {
        style: { width: '1920px', height: '1080px', overflow: 'hidden' },
        // Mirror the Tailwind override trick from AllSlides
        className:
          '[&_.h-screen]:!h-full [&_.w-screen]:!w-full [&_.h-screen]:![height:1080px] [&_.w-screen]:![width:1920px]',
      },
      createElement(SlideComponent),
    ),
  );

  // Give the React tree time to paint (fonts, images, CSS animations settle)
  await new Promise<void>((resolve) => setTimeout(resolve, 350));

  try {
    const canvas = await html2canvas(inner, {
      width: 1920,
      height: 1080,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      // Hint html2canvas to treat the container as the "viewport"
      windowWidth: 1920,
      windowHeight: 1080,
    });
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}

/**
 * Export all slides as a 16:9 PDF and trigger a browser download.
 */
export async function exportToPdf(
  onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const total = slides.length;

  // jsPDF in px mode with 1920×1080 page size (landscape)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1920, 1080],
    compress: true,
    hotfixes: ['px_scaling'],
  });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    onProgress?.({
      current: i + 1,
      total,
      label: slide.title,
    });

    const imgData = await captureSlide(slide.Component);

    if (i > 0) {
      pdf.addPage([1920, 1080], 'landscape');
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, 1920, 1080, undefined, 'FAST');
  }

  pdf.save('Ascend-Pitch-Deck-2026.pdf');
}

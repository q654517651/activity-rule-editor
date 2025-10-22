import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Stage, Layer } from 'react-konva';
import type { Data, StyleCfg, Page } from './types';
import type { ExportProgress } from '@/types';
import { PageCanvas } from './PageCanvas';

function OffscreenExporter({ page, style, pixelRatio, onDone }: { page: Page; style: StyleCfg; pixelRatio: number; onDone: (dataUrl: string) => void }) {
  const stageRef = useRef<any>(null);
  const [h, setH] = useState(style.pad.t + style.font.size * 10 + style.pad.b);
  useEffect(() => {
    // two frames to ensure draw finished
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const dataUrl = stageRef.current?.toDataURL({ pixelRatio }) || '';
        onDone(dataUrl);
      } catch {
        onDone('');
      }
    }));
    return () => cancelAnimationFrame(id);
  }, [h, page, style, pixelRatio, onDone]);

  return (
    <Stage ref={stageRef} width={style.pageWidth} height={h}>
      <Layer>
        <PageCanvas page={page} style={style} forExport onMeasured={setH} />
      </Layer>
    </Stage>
  );
}

export async function renderPageToDataURL(page: Page, style: StyleCfg, pixelRatio = 2): Promise<string> {
  const container = document.createElement('div');
  const root = ReactDOM.createRoot(container);
  return await new Promise<string>((resolve) => {
    const handleDone = (dataUrl: string) => resolve(dataUrl);
    root.render(<OffscreenExporter page={page} style={style} pixelRatio={pixelRatio} onDone={handleDone} />);
  }).finally(() => {
    try { (root as any).unmount?.(); } catch {}
  });
}

export async function exportPagesToPng(
  data: Data,
  style: StyleCfg,
  pixelRatio = 2,
  onProgress?: (progress: ExportProgress) => void
) {
  const out: Array<{ name: string; dataUrl: string }> = [];
  const total = (data.pages || []).length;

  for (let i = 0; i < total; i++) {
    const page = data.pages[i];
    const dataUrl = await renderPageToDataURL(page, style, pixelRatio);
    out.push({ name: `page-${i + 1}.png`, dataUrl });

    // 发送阶段化进度回调（render 阶段）
    if (onProgress) {
      onProgress({
        phase: 'render',
        current: i + 1,
        total,
        detail: `渲染第 ${i + 1} 页`
      });
    }
  }
  return out;
}

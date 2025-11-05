import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Stage, Layer } from 'react-konva';
import type { Data, StyleCfg, Page } from './types';
import type { ExportProgress } from '@/types';
import { PageCanvas } from './PageCanvas';

function OffscreenExporter({ page, style, pixelRatio, onDone }: { page: Page; style: StyleCfg; pixelRatio: number; onDone: (dataUrl: string) => void }) {
  const stageRef = useRef<any>(null);
  // 使用较大的初始值，确保内容不被裁剪
  const [h, setH] = useState(2400);
  
  // 追踪高度稳定性
  const prevHRef = useRef(h);
  const stableCountRef = useRef(0);
  const hasExportedRef = useRef(false);

  useEffect(() => {
    // 如果已经导出过，不再重复
    if (hasExportedRef.current) return;

    // 检查高度是否稳定（连续 3 次测量值变化小于 1px）
    if (Math.abs(prevHRef.current - h) < 1) {
      stableCountRef.current++;
    } else {
      stableCountRef.current = 0;
      prevHRef.current = h;
      return; // 高度还在变化，继续等待
    }

    // 高度已稳定（连续 3 次相同），且已完成测量（不是初始值）
    if (stableCountRef.current >= 3 && h !== 2400) {
      hasExportedRef.current = true;
      
      // 等待 3 帧确保所有内容都已渲染完成
      const id1 = requestAnimationFrame(() => {
        const id2 = requestAnimationFrame(() => {
          const id3 = requestAnimationFrame(() => {
            try {
              const dataUrl = stageRef.current?.toDataURL({ pixelRatio }) || '';
              onDone(dataUrl);
            } catch (e) {
              console.error('导出失败:', e);
              onDone('');
            }
          });
        });
      });
      
      return () => cancelAnimationFrame(id1);
    }
    
    // 超时保护：5 秒后仍未稳定，强制使用当前高度导出
    const timeout = setTimeout(() => {
      if (!hasExportedRef.current) {
        console.warn('高度测量超时，使用当前高度导出:', h);
        hasExportedRef.current = true;
        try {
          const dataUrl = stageRef.current?.toDataURL({ pixelRatio }) || '';
          onDone(dataUrl);
        } catch (e) {
          console.error('导出失败:', e);
          onDone('');
        }
      }
    }, 5000);
    
    return () => clearTimeout(timeout);
  }, [h, pixelRatio, onDone]);

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

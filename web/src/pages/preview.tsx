import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { Button, Input, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, ScrollShadow, Spinner, Tabs, Tab } from '@heroui/react';
import type { Data, StyleCfg } from '@/renderer/canvas/types';
import type { ExportProgress, ExportPhase, ParseResponse } from '@/types';
import { PageCanvas } from '@/renderer/canvas/PageCanvas';
import { exportPagesToPng } from '@/renderer/canvas';
import { savePngsMultiSheet } from '@/utils/file';
import { DragDropZone } from '@/components/DragDropZone';

function defaultStyle(): StyleCfg {
  return {
    pageWidth: 750,
    pad: { t: 100, r: 48, b: 100, l: 48 },
    titleColor: '#0f172a',
    contentColor: '#334155',
    border: { image: '', slice: { t: 100, r: 66, b: 100, l: 66 } },
    font: { family: 'system-ui, sans-serif', size: 24, lineHeight: 1.6 },
  };
}

const API_BASE = 'http://127.0.0.1:8000';

function filenameOf(p: string) {
  try {
    const q = p.split('?')[0];
    const h = q.split('#')[0];
    const segs = h.split('/');
    return segs[segs.length - 1] || h;
  } catch {
    return p;
  }
}

function rewriteImages(data: Data, images?: Record<string, string>): Data {
  if (!images || !Object.keys(images).length) return data;
  const pages = (data.pages || []).map((p) => {
    // 新结构：blocks
    if (p.blocks && p.blocks.length > 0) {
      return {
        ...p,
        blocks: p.blocks.map((block) => ({
          ...block,
          sections: (block.sections || []).map((s) => ({
            ...s,
            rewards: (s.rewards || []).map((r) => {
              if (!r.image) return r;
              const name = filenameOf(typeof r.image === 'string' ? r.image : r.image?.url || '');
              const uri = images[name];
              return uri ? { ...r, image: uri } : r;
            }),
          })),
        })),
      };
    }
    // 旧结构：sections（向后兼容）
    return {
      ...p,
      sections: (p.sections || []).map((s) => ({
        ...s,
        rewards: (s.rewards || []).map((r) => {
          if (!r.image) return r;
          const name = filenameOf(typeof r.image === 'string' ? r.image : r.image?.url || '');
          const uri = images[name];
          return uri ? { ...r, image: uri } : r;
        }),
      })),
    };
  });
  return { ...data, pages };
}

export default function PreviewPage() {
  // 多 Sheet 状态管理
  const [allSheets, setAllSheets] = useState<Map<string, Data>>(new Map());
  const [currentSheet, setCurrentSheet] = useState<string>('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  
  // 当前 sheet 的数据（从 allSheets 中获取）
  const [data, setData] = useState<Data>({ pages: [] });
  const [style, setStyle] = useState<StyleCfg>(defaultStyle());
  const [pixelRatio, setPixelRatio] = useState(1);
  const [zoomPct, setZoomPct] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heights, setHeights] = useState<number[]>([]);

  // 阶段化导出进度跟踪
  const [exportPhase, setExportPhase] = useState<ExportPhase | null>(null);
  const [renderCurr, setRenderCurr] = useState(0);
  const [renderTotal, setRenderTotal] = useState(0);
  const [zipPercent, setZipPercent] = useState(0);
  const [writePercent, setWritePercent] = useState(0);

  // 防抖样式更新器 - 停止输入 500ms 后才刷新画布
  const debounceTimerRef = useRef<number | null>(null);
  const pendingStyle = useRef<Partial<StyleCfg>>({});

  const setStyleDebounced = useCallback((partial: Partial<StyleCfg>) => {
    pendingStyle.current = { ...pendingStyle.current, ...partial };
    
    // 清除之前的定时器
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // 设置新的定时器：500ms 后更新
    debounceTimerRef.current = window.setTimeout(() => {
      if (Object.keys(pendingStyle.current).length > 0) {
        setStyle(s => ({ ...s, ...pendingStyle.current }));
        pendingStyle.current = {};
      }
      debounceTimerRef.current = null;
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const onPickJson = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Data;
      console.log('【调试】用户上传 JSON 内容:\n' + JSON.stringify(json, null, 2));
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onPickXlsx = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/api/parse`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`后端返回错误: ${res.status}`);
      const payload = await res.json() as ParseResponse;
      if (!payload?.ok) throw new Error(payload?.error || '解析失败');
      
      // 统一处理 sheets 结构
      const sheets = new Map<string, Data>();
      const names = Object.keys(payload.sheets);
      
      // 调试：打印完整的后端返回数据
      console.log('【完整后端返回】', JSON.stringify(payload, null, 2));
      
      names.forEach(name => {
        // 调用 rewriteImages 重写图片 URL
        const sheetData = rewriteImages(
          payload.sheets[name].result,
          payload.sheets[name].images
        );
        sheets.set(name, sheetData);
        
        // 调试：打印每个 sheet 处理后的数据
        console.log(`【Sheet: ${name} 处理后】`, JSON.stringify(sheetData, null, 2));
      });
      
      setAllSheets(sheets);
      setSheetNames(names);
      
      // 选中第一个 sheet
      if (names.length > 0) {
        setCurrentSheet(names[0]);
        setData(sheets.get(names[0])!);
      } else {
        setError('没有找到有效的 sheet（需要包含 REGION- 标记）');
      }
      
      console.log(`✓ 加载 ${names.length} 个 sheet:`, names);
      if (payload.skipped_sheets?.length) {
        console.log(`✗ 跳过 ${payload.skipped_sheets.length} 个 sheet:`, payload.skipped_sheets);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onPickDataFile = useCallback(
    (file: File) => {
      if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
        onPickJson(file);
      } else if (
        file.name.toLowerCase().endsWith('.xlsx') ||
        file.type.includes('spreadsheet')
      ) {
        onPickXlsx(file);
      } else {
        setError('仅支持 JSON 或 XLSX 文件');
      }
    },
    [onPickJson, onPickXlsx]
  );

  const onPickBorder = useCallback(async (file: File) => {
    const blobUrl = URL.createObjectURL(file);
    try {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      const d = await new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.readAsDataURL(blob);
      });
      setStyle((s) => ({ ...s, border: { ...s.border, image: d } }));
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }, []);

  // Sheet 切换处理
  const onSheetChange = useCallback((sheetName: string) => {
    const sheetData = allSheets.get(sheetName);
    if (sheetData) {
      setCurrentSheet(sheetName);
      setData(sheetData);
      setHeights([]);  // 重置高度缓存
    }
  }, [allSheets]);

  const onExport = useCallback(async () => {
    setLoading(true);
    setExportPhase('render');
    setRenderCurr(0);
    setZipPercent(0);
    setWritePercent(0);

    try {
      const allExports: Array<{
        sheetName: string;
        items: Array<{ name: string; dataUrl: string }>;
      }> = [];
      
      // 计算总页数
      const totalPages = Array.from(allSheets.values()).reduce((sum, sheet) => sum + (sheet.pages?.length || 0), 0);
      setRenderTotal(totalPages);
      
      let currentPage = 0;
      
      // 遍历所有 sheet，分别渲染
      for (const [sheetName, sheetData] of allSheets) {
        const items = await exportPagesToPng(sheetData, style, pixelRatio, (progress: ExportProgress) => {
          if (progress.phase === 'render') {
            setRenderCurr(currentPage + progress.current);
          }
        });
        
        currentPage += sheetData.pages?.length || 0;
        allExports.push({ sheetName, items });
      }

      // 第二步：打包、写入和下载
      setExportPhase('zip');
      setZipPercent(0);
      const res = await savePngsMultiSheet(allExports, (progress: ExportProgress) => {
        if (progress.phase === 'zip') {
          setZipPercent(progress.current);
        } else if (progress.phase === 'write') {
          setExportPhase('write');
          const pct = Math.max(0, Math.min(100, Math.round((progress.current / Math.max(progress.total, 1)) * 100)));
          setWritePercent(pct);
        } else if (progress.phase === 'done') {
          setExportPhase('done');
        }
      });
      if (!res?.ok) throw new Error(res?.error || '导出失败');
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
      // 延迟清空状态，让用户看到"已完成"提示
      setTimeout(() => {
        setExportPhase(null);
        setRenderCurr(0);
        setRenderTotal(0);
        setZipPercent(0);
        setWritePercent(0);
      }, 1500);
    }
  }, [allSheets, style, pixelRatio]);

  // 当页数变化时，初始化高度数组，避免 undefined 参与计算
  useEffect(() => {
    setHeights((prev) => {
      const next = new Array(data.pages.length).fill(1000);
      for (let i = 0; i < Math.min(prev.length, next.length); i++) next[i] = prev[i] || 1000;
      return next;
    });
  }, [data.pages.length]);

  // 稳定每页测量回调，避免闭包新建导致子组件 effect 重跑
  const onMeasuredByIndex = useCallback((idx: number) => (h: number) => {
    if (typeof h !== 'number' || !isFinite(h) || h <= 0) return;
    setHeights((arr) => {
      if (arr[idx] === h) return arr;
      const next = [...arr];
      next[idx] = h;
      return next;
    });
  }, []);

  // 判断是否显示多 sheet 导航
  const isMultiSheet = sheetNames.length > 1;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧固定控制区 */}
      <aside style={{ 
        width: 450, 
        display: 'flex', 
        flexDirection: 'column',
        flexShrink: 0,
        borderRight: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }}>
        {/* 可滚动工具栏区域 */}
        <ScrollShadow style={{ flex: 1, padding: 16 }} className="w-full">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium mb-4 text-gray-900">上传数据</h3>
          <DragDropZone
            onFile={onPickDataFile}
            accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            loading={loading}
            label="选择 JSON 或 XLSX 文件"
            description="点击选择或拖拽文件到此处"
            icon="📁"
          />
          {error ? <div className="text-xs text-red-600 mt-3">{error}</div> : null}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
          <h3 className="text-sm font-medium mb-4 text-gray-900">边框图 & 切片</h3>
          <DragDropZone
            onFile={onPickBorder}
            accept="image/*"
            loading={loading}
            label="选择边框图片"
            description="点击选择或拖拽图片到此处"
            icon="🖼️"
          />
          <div className="grid grid-cols-4 gap-2 mt-3">
            <Input size="sm" type="number" label="Top" value={String(style.border.slice.t)} onValueChange={(v)=>setStyleDebounced({ border:{ ...style.border, slice:{ ...style.border.slice, t:Number(v||0) } } })} />
            <Input size="sm" type="number" label="Right" value={String(style.border.slice.r)} onValueChange={(v)=>setStyleDebounced({ border:{ ...style.border, slice:{ ...style.border.slice, r:Number(v||0) } } })} />
            <Input size="sm" type="number" label="Bottom" value={String(style.border.slice.b)} onValueChange={(v)=>setStyleDebounced({ border:{ ...style.border, slice:{ ...style.border.slice, b:Number(v||0) } } })} />
            <Input size="sm" type="number" label="Left" value={String(style.border.slice.l)} onValueChange={(v)=>setStyleDebounced({ border:{ ...style.border, slice:{ ...style.border.slice, l:Number(v||0) } } })} />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
          <h3 className="text-sm font-medium mb-4 text-gray-900">样式</h3>

          {/* 标题颜色 */}
          <div className="mb-3">
            <Input
              size="md"
              type="text"
              label="标题颜色"
              value={style.titleColor}
              onValueChange={(v) => {
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  setStyleDebounced({ titleColor: v });
                }
              }}
              placeholder="#000000"
              endContent={
                <div
                  className="relative pointer-events-auto flex items-center justify-center h-full"
                  style={{ alignSelf: 'stretch' }}
                >
                  <button
                    type="button"
                    aria-label="选择标题颜色"
                    className="h-8 w-10 rounded-[4px] border border-default-300 flex-shrink-0"
                    style={{ backgroundColor: style.titleColor }}
                  />
                  <input
                    type="color"
                    value={style.titleColor}
                    onChange={(e) => setStyleDebounced({ titleColor: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  />
                </div>
              }
            />
          </div>

          {/* 正文颜色 */}
          <div className="mb-3">
            <Input
              size="md"
              type="text"
              label="正文颜色"
              value={style.contentColor}
              onValueChange={(v) => {
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  setStyleDebounced({ contentColor: v });
                }
              }}
              placeholder="#000000"
              endContent={
                <div
                  className="relative pointer-events-auto flex items-center justify-center h-full"
                  style={{ alignSelf: 'stretch' }}
                >
                  <button
                    type="button"
                    aria-label="选择正文颜色"
                    className="h-8 w-10 rounded-[4px] border border-default-300 flex-shrink-0"
                    style={{ backgroundColor: style.contentColor }}
                  />
                  <input
                    type="color"
                    value={style.contentColor}
                    onChange={(e) => setStyleDebounced({ contentColor: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
                  />
                </div>
              }
            />
          </div>

          {/* 内边距 - 使用防抖更新 */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">内边距</label>
            <div className="grid grid-cols-4 gap-2">
              <Input size="sm" type="number" label="上" value={String(style.pad.t)} onValueChange={(v)=>setStyleDebounced({ pad:{ ...style.pad, t:Number(v||0) } })} />
              <Input size="sm" type="number" label="右" value={String(style.pad.r)} onValueChange={(v)=>setStyleDebounced({ pad:{ ...style.pad, r:Number(v||0) } })} />
              <Input size="sm" type="number" label="下" value={String(style.pad.b)} onValueChange={(v)=>setStyleDebounced({ pad:{ ...style.pad, b:Number(v||0) } })} />
              <Input size="sm" type="number" label="左" value={String(style.pad.l)} onValueChange={(v)=>setStyleDebounced({ pad:{ ...style.pad, l:Number(v||0) } })} />
            </div>
          </div>
        </div>
        </ScrollShadow>

        {/* 固定在底部的导出区域 */}
        <div className="bg-white border-t border-gray-200 p-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              color="primary"
              className="flex-1"
              onPress={onExport}
              isDisabled={loading || allSheets.size === 0}
              startContent={exportPhase ? <Spinner size="sm" color="current" variant="wave" /> : undefined}
            >
              {exportPhase === 'render'
                ? `导出中... 剩余 ${Math.max(0, renderTotal - renderCurr)} 张`
                : exportPhase === 'zip'
                ? `打包中... ${zipPercent}%`
                : exportPhase === 'write'
                ? `写入中... ${writePercent}%`
                : exportPhase === 'done'
                ? '✓ 已完成'
                : isMultiSheet
                ? `导出全部 (${sheetNames.length} 个表)`
                : '导出 PNG'
              }
            </Button>
            <Dropdown>
              <DropdownTrigger>
                <Button size="md" variant="flat" isDisabled={loading}>{pixelRatio}x</Button>
              </DropdownTrigger>
              <DropdownMenu selectionMode="single" selectedKeys={new Set([String(pixelRatio)])} onSelectionChange={(keys)=>{ const k=Array.from(keys as Set<string>)[0]; if (k) setPixelRatio(Number(k)); }}>
                <DropdownItem key="1">1x</DropdownItem>
                <DropdownItem key="2">2x</DropdownItem>
                <DropdownItem key="3">3x</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </aside>

      {/* 右侧画布区域 - 整体可滚动 */}
      <section style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* 顶部导航栏 - 固定 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Sheet Tabs（多 sheet 时显示） */}
            {isMultiSheet && (
              <Tabs 
                selectedKey={currentSheet}
                onSelectionChange={(key) => onSheetChange(key as string)}
                size="sm"
                variant="underlined"
                classNames={{
                  tabList: "gap-6",
                  cursor: "w-full bg-blue-500",
                  tab: "max-w-fit px-0 h-10",
                  tabContent: "group-data-[selected=true]:text-blue-500"
                }}
              >
                {sheetNames.map(name => (
                  <Tab 
                    key={name} 
                    title={
                      <div className="flex items-center gap-2">
                        <span>{name}</span>
                        <span className="text-xs opacity-60">({allSheets.get(name)?.pages?.length || 0})</span>
                      </div>
                    }
                  />
                ))}
              </Tabs>
            )}
            
            {/* 缩放控制 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">缩放</span>
              <Dropdown>
                <DropdownTrigger>
                  <Button size="sm" variant="flat">{zoomPct}%</Button>
                </DropdownTrigger>
                <DropdownMenu selectionMode="single" selectedKeys={new Set([String(zoomPct)])} onSelectionChange={(keys)=>{ const k=Array.from(keys as Set<string>)[0]; if (k) setZoomPct(Number(k)); }}>
                  <DropdownItem key="25">25%</DropdownItem>
                  <DropdownItem key="50">50%</DropdownItem>
                  <DropdownItem key="75">75%</DropdownItem>
                  <DropdownItem key="100">100%</DropdownItem>
                </DropdownMenu>
              </Dropdown>
              <span className="text-sm text-gray-500">共 {data.pages?.length || 0} 页</span>
            </div>
          </div>
        </div>

        {/* 可滚动的画布容器 - 支持横向和纵向滚动 */}
        <div style={{ 
          flex: 1, 
          overflow: 'auto',
          padding: 16,
          backgroundColor: '#f9fafb'
        }}>
          <div style={{ display: 'flex', gap: 16, width: 'max-content' }}>
          {data.pages.map((p, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {p.region && (
                <div className="text-sm font-semibold text-black">
                  页面{p.region}
                </div>
              )}
              <div style={{ position: 'relative', width: Math.round(style.pageWidth * (zoomPct/100)), height: Math.round((heights[i] || 1000) * (zoomPct/100)), transform: `scale(${zoomPct/100})`, transformOrigin: 'top left' }}>
                <Stage width={style.pageWidth} height={(heights[i] && isFinite(heights[i])) ? heights[i] : 1000}>
                  <Layer>
                    <PageCanvas page={p} style={style} onMeasured={onMeasuredByIndex(i)} />
                  </Layer>
                </Stage>
              </div>
            </div>
          ))}
          </div>
        </div>
      </section>
    </div>
  );
}

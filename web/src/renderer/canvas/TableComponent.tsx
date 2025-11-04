import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { Group, Rect, Text, Line, Image as KImage } from 'react-konva';
import type { TableData } from './types';
import type Konva from 'konva';
import { loadBitmap } from './useImageCache';

export function TableComponent({
  table,
  x,
  y,
  width,
  fontSize,
  fontFamily,
  titleColor,
  contentColor,
  direction = 'ltr',
  onHeightMeasured,
}: {
  table: TableData;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  titleColor: string;
  contentColor: string;
  direction?: 'rtl' | 'ltr';
  onHeightMeasured?: (height: number) => void;
}) {
  // 存储每个单元格文本节点的高度
  const [cellHeights, setCellHeights] = useState<Map<string, number>>(new Map());
  const textRefs = useRef<Map<string, Konva.Text>>(new Map());
  const imageRefs = useRef<Map<string, Konva.Image>>(new Map());
  
  // 存储已加载的图片
  const [loadedImages, setLoadedImages] = useState<Map<string, CanvasImageSource>>(new Map());
  
  // 加载所有表格中的图片
  useEffect(() => {
    const loadImages = async () => {
      const newImages = new Map<string, CanvasImageSource>();
      
      for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
        const row = table.rows[rowIdx];
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const cell = row[colIdx];
          if (cell.is_image && cell.image) {
            const key = `${rowIdx}-${colIdx}`;
            
            // 处理新旧两种格式：字符串 URL 或 ImageMeta 对象（与奖励图片一致）
            const imageUrl = typeof cell.image === 'string'
              ? cell.image
              : cell.image?.url;
            
            if (imageUrl) {
              const bmp = await loadBitmap(imageUrl);
              if (bmp) {
                newImages.set(key, bmp as any);
              }
            }
          }
        }
      }
      
      setLoadedImages(newImages);
    };
    
    loadImages();
  }, [table]);
  
  const colCount = table.headers.length;
  const colWidth = width / colCount;
  const cellPadding = 8;
  const minRowHeight = fontSize * 2;
  const textAlign = direction === 'rtl' ? 'right' : 'left';
  const cornerRadius = 8; // 圆角半径
  
  // 测量所有单元格的实际高度
  useLayoutEffect(() => {
    const newHeights = new Map<string, number>();
    let hasChanges = false;
    
    // 测量文本节点
    textRefs.current.forEach((textNode, key) => {
      if (textNode) {
        const height = textNode.height();
        if (height > 0) {
          newHeights.set(key, height);
          if (!cellHeights.has(key) || cellHeights.get(key) !== height) {
            hasChanges = true;
          }
        }
      }
    });
    
    // 测量图片节点
    imageRefs.current.forEach((imageNode, key) => {
      if (imageNode) {
        const height = imageNode.height();
        if (height > 0) {
          newHeights.set(key, height);
          if (!cellHeights.has(key) || cellHeights.get(key) !== height) {
            hasChanges = true;
          }
        }
      }
    });
    
    if (hasChanges) {
      setCellHeights(newHeights);
    }
  });
  
  // 计算每行的最大高度
  const getRowHeight = (rowIdx: number) => {
    let maxHeight = minRowHeight;
    
    // 遍历该行的所有列
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const key = `${rowIdx}-${colIdx}`;
      const cellHeight = cellHeights.get(key);
      if (cellHeight && cellHeight > maxHeight) {
        maxHeight = cellHeight;
      }
    }
    
    // 加上上下 padding
    return maxHeight + cellPadding * 2;
  };
  
  // 计算表头高度
  const headerHeight = getRowHeight(-1); // 用 -1 表示表头行
  
  // 计算每个数据行的 Y 坐标和高度
  const rowPositions: Array<{ y: number; height: number }> = [];
  let currentY = headerHeight;
  
  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const rowH = getRowHeight(rowIdx);
    rowPositions.push({ y: currentY, height: rowH });
    currentY += rowH;
  }
  
  const totalHeight = currentY;
  
  // 通知父组件总高度 - 只依赖 totalHeight，确保每次高度变化都会通知
  const onHeightMeasuredRef = useRef(onHeightMeasured);
  
  useLayoutEffect(() => {
    onHeightMeasuredRef.current = onHeightMeasured;
  }, [onHeightMeasured]);
  
  useLayoutEffect(() => {
    if (onHeightMeasuredRef.current && totalHeight > 0) {
      onHeightMeasuredRef.current(totalHeight);
    }
  }, [totalHeight]);
  
  return (
    <Group x={x} y={y}>
      {/* 表头行 */}
      <Group>
        {/* 表头背景 - 上方圆角 */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={headerHeight}
          fill="rgba(255, 255, 255, 0.2)"
          cornerRadius={[cornerRadius, cornerRadius, 0, 0]}
        />
        
        {/* 表头文字 */}
        {table.headers.map((header, colIdx) => {
          const key = `-1-${colIdx}`;
          const textHeight = cellHeights.get(key) || 0;
          const verticalOffset = (headerHeight - textHeight) / 2;
          
          return (
            <Text
              key={key}
              ref={(node) => {
                if (node) {
                  textRefs.current.set(key, node);
                } else {
                  textRefs.current.delete(key);
                }
              }}
              x={colIdx * colWidth + cellPadding}
              y={Math.max(cellPadding, verticalOffset)}
              width={colWidth - cellPadding * 2}
              text={header}
              fontSize={fontSize}
              fontFamily={fontFamily}
              fontStyle="bold"
              fill={titleColor}
              align="center"
              verticalAlign="top"
              direction={direction}
              wrap="word"
            />
          );
        })}
        
        {/* 表头底部分割线 */}
        <Line
          points={[0, headerHeight, width, headerHeight]}
          stroke="rgba(0, 0, 0, 0.3)"
          strokeWidth={1}
        />
        
        {/* 表头列分割线 */}
        {table.headers.map((_, colIdx) => {
          if (colIdx === 0) return null;
          return (
            <Line
              key={`header-vline-${colIdx}`}
              points={[colIdx * colWidth, 0, colIdx * colWidth, headerHeight]}
              stroke="rgba(0, 0, 0, 0.3)"
              strokeWidth={1}
            />
          );
        })}
      </Group>
      
      {/* 数据行 */}
      {table.rows.map((row, rowIdx) => {
        const pos = rowPositions[rowIdx];
        if (!pos) return null;
        
        const { y: rowY, height: rowH } = pos;
        
        return (
          <Group key={`row-${rowIdx}`}>
            {/* 数据行背景 */}
            <Rect
              x={0}
              y={rowY}
              width={width}
              height={rowH}
              fill="rgba(255, 255, 255, 0.1)"
            />
            
            {/* 数据单元格内容 */}
            {row.map((cell, colIdx) => {
              const key = `${rowIdx}-${colIdx}`;
              const cellX = colIdx * colWidth;
              
              // 如果是图片
              if (cell.is_image && cell.image) {
                const bmp = loadedImages.get(key);
                
                if (bmp) {
                  // 计算图片尺寸：尽量充满单元格，保持比例，留间距
                  const maxImgWidth = colWidth - cellPadding * 2;
                  const maxImgHeight = rowH - cellPadding * 2;
                  
                  // 获取图片的原始尺寸
                  const originalW = (bmp as any).width || 1;
                  const originalH = (bmp as any).height || 1;
                  const imgAspect = originalW / originalH;
                  
                  let imgW = maxImgWidth;
                  let imgH = imgW / imgAspect;
                  
                  // 如果高度超出，按高度缩放
                  if (imgH > maxImgHeight) {
                    imgH = maxImgHeight;
                    imgW = imgH * imgAspect;
                  }
                  
                  // 居中显示图片（水平和垂直都居中）
                  const imgX = cellX + (colWidth - imgW) / 2;
                  const imgY = rowY + (rowH - imgH) / 2;
                  
                  return (
                    <KImage
                      key={key}
                      ref={(node) => {
                        if (node) {
                          imageRefs.current.set(key, node);
                        } else {
                          imageRefs.current.delete(key);
                        }
                      }}
                      x={imgX}
                      y={imgY}
                      width={imgW}
                      height={imgH}
                      image={bmp as any}
                    />
                  );
                }
                // 图片加载中或未加载，返回空占位
                return null;
              }
              
              // 文字内容
              const textHeight = cellHeights.get(key) || 0;
              const verticalOffset = (rowH - textHeight) / 2;
              
              return (
                <Text
                  key={key}
                  ref={(node) => {
                    if (node) {
                      textRefs.current.set(key, node);
                    } else {
                      textRefs.current.delete(key);
                    }
                  }}
                  x={cellX + cellPadding}
                  y={rowY + Math.max(cellPadding, verticalOffset)}
                  width={colWidth - cellPadding * 2}
                  text={cell.value}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  fill={contentColor}
                  align={textAlign}
                  verticalAlign="top"
                  direction={direction}
                  wrap="word"
                />
              );
            })}
            
            {/* 数据行底部分割线 */}
            <Line
              points={[0, rowY + rowH, width, rowY + rowH]}
              stroke="rgba(0, 0, 0, 0.3)"
              strokeWidth={1}
            />
            
            {/* 数据行列分割线 */}
            {row.map((_, colIdx) => {
              if (colIdx === 0) return null;
              return (
                <Line
                  key={`data-vline-${rowIdx}-${colIdx}`}
                  points={[
                    colIdx * colWidth, rowY,
                    colIdx * colWidth, rowY + rowH
                  ]}
                  stroke="rgba(0, 0, 0, 0.3)"
                  strokeWidth={1}
                />
              );
            })}
          </Group>
        );
      })}
      
      {/* 左右边框 */}
      <Line
        points={[0, 0, 0, totalHeight]}
        stroke="rgba(0, 0, 0, 0.3)"
        strokeWidth={1}
      />
      <Line
        points={[width, 0, width, totalHeight]}
        stroke="rgba(0, 0, 0, 0.3)"
        strokeWidth={1}
      />
      
      {/* 四角圆角遮罩（使用透明 Rect 绘制圆角边框） */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={totalHeight}
        stroke="rgba(0, 0, 0, 0.3)"
        strokeWidth={1}
        cornerRadius={cornerRadius}
        listening={false}
      />
    </Group>
  );
}


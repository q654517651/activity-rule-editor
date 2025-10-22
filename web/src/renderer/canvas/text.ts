/**
 * 获取离屏 Canvas context，用于文本测量
 * 复用同一个 context 以提高性能
 */
let cachedContext: CanvasRenderingContext2D | null = null;

function getCanvasContext(): CanvasRenderingContext2D {
  if (!cachedContext) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 Canvas context');
    cachedContext = ctx;
  }
  return cachedContext;
}

/**
 * 测量单行文本的真实宽度
 */
function measureTextWidth(text: string, font: string): number {
  const ctx = getCanvasContext();
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * 测量纯文本渲染所需的高度
 * 使用 Canvas API 进行精确测量，完全替代估算
 * @returns 返回高度（像素），如果参数无效则返回 0
 */
export function measurePlainTextHeight({
  text,
  width,
  fontSize,
  lineHeight,
  fontFamily,
}: {
  text: string;
  width: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
}): number {
  // 参数校验，防止 NaN
  if (!text || typeof width !== 'number' || width <= 0 ||
      typeof fontSize !== 'number' || fontSize <= 0 ||
      typeof lineHeight !== 'number' || lineHeight <= 0) {
    return 0;
  }

  try {
    // 构建字体字符串，与 Konva Text 组件兼容
    const fontStr = `${fontSize}px ${fontFamily}`;

    // 按换行符分割文本
    const paragraphs = text.split('\n');

    let totalLines = 0;

    for (const paragraph of paragraphs) {
      if (!paragraph) {
        // 空行也占一行
        totalLines += 1;
        continue;
      }

      // 对每个段落进行精确的换行计算
      let currentLineWidth = 0;
      let lineCount = 1;
      let i = 0;

      while (i < paragraph.length) {
        // 逐字符累加宽度
        const char = paragraph[i];
        const charWidth = measureTextWidth(char, fontStr);

        if (currentLineWidth + charWidth > width) {
          // 超出宽度，开始新行
          lineCount += 1;
          currentLineWidth = charWidth;
        } else {
          currentLineWidth += charWidth;
        }
        i++;
      }

      totalLines += lineCount;
    }

    // 计算总高度: 行数 × 字号 × 行高
    const result = Math.ceil(totalLines * fontSize * lineHeight);

    // 确保返回值有效
    return isFinite(result) && result > 0 ? result : 0;
  } catch (e) {
    console.warn('文本高度测量失败，返回 0', e);
    return 0;
  }
}


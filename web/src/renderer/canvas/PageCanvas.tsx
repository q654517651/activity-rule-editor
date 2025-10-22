import React, { useEffect, useMemo, useState } from 'react';
import { Group, Image as KImage, Text, Rect } from 'react-konva';
import type { Page, StyleCfg, Reward, Section } from './types';
import { loadBitmap } from './useImageCache';
import { NineSlice } from './nineSlice';
import { measurePlainTextHeight } from './text';

/**
 * 规范化页面数据：如果有 blocks，展平为 sections；如果有 sections，保持原样
 * 关键：展平时保留 block_type 信息，这样渲染时能区分规则和奖励
 */
function normalizePage(page: Page): Page {
  if (page.blocks && page.blocks.length > 0) {
    // 新结构：将所有 blocks 的 sections 展平，但保留 block 元数据
    const allSections: Section[] = [];
    
    for (const block of page.blocks) {
      // 为块内的每个 section 添加 block 元数据
      if (block.sections && block.sections.length > 0) {
        for (const section of block.sections) {
          allSections.push({
            ...section,
            _blockType: block.block_type,      // 保留块类型（rules/rewards）
            _blockTitle: block.block_title,    // 保留块标题
          });
        }
      }
    }
    
    return {
      ...page,
      sections: allSections,
      blocks: undefined, // 清除 blocks 以避免重复处理
    };
  }
  // 旧结构或两者都不存在，直接返回
  return page;
}

/**
 * 奖励项组件 - 图片在上（160x160），文字在下（标题 + 描述）
 * 返回组件实际占用的高度
 */
function RewardItem({
  reward,
  x,
  y,
  width,
  style,
  onHeightMeasured,
}: {
  reward: Reward;
  x: number;
  y: number;
  width: number;
  style: StyleCfg;
  onHeightMeasured?: (h: number) => void;
}) {
  const [rewardImg, setRewardImg] = useState<CanvasImageSource | null>(null);

  useEffect(() => {
    if (!reward.image) {
      setRewardImg(null);
      return;
    }
    (async () => {
      // 处理新旧两种格式：字符串 URL 或 ImageMeta 对象
      const imageUrl = typeof reward.image === 'string'
        ? reward.image
        : reward.image?.url;

      if (!imageUrl) {
        setRewardImg(null);
        return;
      }

      const bmp = await loadBitmap(imageUrl);
      setRewardImg(bmp as any);
    })();
  }, [reward.image]);

  // 图片尺寸（保持正方形容器，内部图片长边贴边）
  const imgBoxSize = 160;
  const imgPadding = 4;
  const imgBoxH = imgBoxSize + imgPadding * 2; // 图片容器总高度

  // 计算图片的实际尺寸（长边贴边，保持比例）
  let displayImgW = imgBoxSize;
  let displayImgH = imgBoxSize;
  let imgOffsetX = 0;
  let imgOffsetY = 0;

  if (rewardImg) {
    const originalW = (rewardImg as any).width || 1;
    const originalH = (rewardImg as any).height || 1;
    const aspectRatio = originalW / originalH;

    // 长边贴边：宽图填满宽度，高图填满高度
    if (aspectRatio > 1) {
      // 横向图片：宽度填满，高度按比例
      displayImgW = imgBoxSize;
      displayImgH = imgBoxSize / aspectRatio;
      imgOffsetY = (imgBoxSize - displayImgH) / 2; // 垂直居中
    } else {
      // 纵向图片：高度填满，宽度按比例
      displayImgH = imgBoxSize;
      displayImgW = imgBoxSize * aspectRatio;
      imgOffsetX = (imgBoxSize - displayImgW) / 2; // 水平居中
    }
  }

  // 文字区域
  const textStartY = imgBoxH + 4;
  const textGapV = 4;

  // 标题高度
  const nameH = reward.name
    ? Math.ceil(style.font.size * style.font.lineHeight)
    : 0;

  // 描述高度（动态测量）
  const descH = reward.desc && width > 0
    ? measurePlainTextHeight({
        text: reward.desc,
        width: width,
        fontSize: style.font.size - 2,
        lineHeight: style.font.lineHeight,
        fontFamily: style.font.family,
      })
    : 0;

  // 总高度
  const totalH = imgBoxH + (nameH ? nameH + textGapV : 0) + (descH ? descH + textGapV : 0);

  useEffect(() => {
    if (onHeightMeasured) {
      onHeightMeasured(totalH);
    }
  }, [totalH, onHeightMeasured]);

  return (
    <Group x={x} y={y}>
      {/* 奖励图片 - 在容器内垂直和水平居中，长边贴边 */}
      {rewardImg && (
        <KImage
          image={rewardImg as any}
          x={(width - imgBoxSize) / 2 + imgOffsetX}
          y={imgPadding + imgOffsetY}
          width={displayImgW}
          height={displayImgH}
        />
      )}

      {/* 奖励名称（标题，加粗，在列宽内水平居中） */}
      {reward.name && (
        <Text
          text={reward.name}
          x={0}
          y={textStartY}
          width={width}
          align="center"
          fontSize={style.font.size}
          fontFamily={style.font.family}
          fill={style.titleColor}
          fontStyle="bold"
        />
      )}

      {/* 奖励描述 - 在列宽内水平居中 */}
      {reward.desc ? (
        <Text
          text={reward.desc}
          x={0}
          y={textStartY + nameH + textGapV}
          width={width}
          align="center"
          fontSize={style.font.size - 2}
          fontFamily={style.font.family}
          fill={style.contentColor}
          lineHeight={style.font.lineHeight}
        />
      ) : null}
    </Group>
  );
}

export function PageCanvas({
  page,
  style,
  forExport = false,
  onMeasured,
}: {
  page: Page;
  style: StyleCfg;
  forExport?: boolean;
  onMeasured?: (height: number) => void;
}) {
  // 规范化页面数据：支持新旧两种结构
  const normalizedPage = useMemo(() => normalizePage(page), [page]);

  const W = style.pageWidth;
  const PAD = style.pad;
  const [borderBmp, setBorderBmp] = useState<CanvasImageSource | null>(null);

  useEffect(() => {
    (async () => {
      setBorderBmp(null);
      const bmp = await loadBitmap(style.border.image);
      if (bmp) setBorderBmp(bmp as any);
    })();
  }, [style.border.image]);

  // 确保所有数值有效，防止 NaN
  const contentX = isFinite(PAD.l) ? PAD.l : 0;
  const contentY = isFinite(PAD.t) ? PAD.t : 0;
  const contentW = isFinite(W) && isFinite(PAD.l) && isFinite(PAD.r) ? W - PAD.l - PAD.r : 0;

  // 布局：各个 section（每个 section 包含标题、内容、奖励）
  // 页面标题已移至 Canvas 外部，不再在此渲染
  const gapH = 12;
  const sectionGap = 20; // section 之间的间距

  // 奖励网格配置
  const rewardColCount = 3; // 一排3个奖励
  const rewardGutterX = 12; // 奖励列之间的水平间距
  const rewardGapH = 12; // 奖励行之间的垂直间距
  const rewardColW = contentW > 0
    ? (contentW - rewardGutterX * (rewardColCount - 1)) / rewardColCount
    : 0;

  // 存储每行奖励的最大高度
  const rewardRowHeights: Record<number, number> = {};

  // 计算每个 section 的高度和布局信息
  const sections = (normalizedPage.sections || []).map((section, sectionIdx) => {
    // section 标题高度（如果有）
    const titleH = section.title
      ? Math.ceil(style.font.size * style.font.lineHeight)
      : 0;

    // section 内容高度
    const contentH = section.content && contentW > 0
      ? measurePlainTextHeight({
          text: section.content,
          width: contentW,
          fontSize: style.font.size,
          lineHeight: style.font.lineHeight,
          fontFamily: style.font.family,
        })
      : 0;

    // section 奖励区域高度（需要预测）
    const rewards = section.rewards || [];
    const rewardRows = rewards.length > 0 ? Math.ceil(rewards.length / rewardColCount) : 0;

    // 预测每行的最大高度（基于最坏情况：每个奖励都有长描述）
    let rewardsH = 0;
    for (let row = 0; row < rewardRows; row++) {
      const rowStartIdx = row * rewardColCount;
      const rowEndIdx = Math.min(rowStartIdx + rewardColCount, rewards.length);
      let maxRowH = 0;

      for (let i = rowStartIdx; i < rowEndIdx; i++) {
        const r = rewards[i];
        const nameH = r.name ? Math.ceil(style.font.size * style.font.lineHeight) : 0;
        const descH = r.desc && rewardColW > 0
          ? measurePlainTextHeight({
              text: r.desc,
              width: rewardColW,
              fontSize: style.font.size - 2,
              lineHeight: style.font.lineHeight,
              fontFamily: style.font.family,
            })
          : 0;
        const itemH = 160 + 8 + (nameH ? nameH + 4 : 0) + (descH ? descH + 4 : 0);
        maxRowH = Math.max(maxRowH, itemH);
      }

      rewardRowHeights[`${sectionIdx}-${row}`] = maxRowH;
      rewardsH += maxRowH;
      if (row < rewardRows - 1) rewardsH += rewardGapH;
    }

    // section 总高度
    const sectionH =
      (titleH ? titleH + gapH : 0) +
      (contentH ? contentH + gapH : 0) +
      rewardsH;

    return {
      section,
      titleH,
      contentH,
      rewardsH,
      sectionH,
      rewards,
      rewardRows,
    };
  });

  // 计算总高度
  const sectionsH = sections.reduce((sum, s, i) => {
    return sum + s.sectionH + (i > 0 ? sectionGap : 0);
  }, 0);

  // 页面标题已移至 Canvas 外部，不再计入高度
  const innerH = sectionsH;
  const H = PAD.t + innerH + PAD.b;

  useEffect(() => {
    // 仅在高度变化时告知父组件，避免因回调引用变化造成的无限循环
    if (typeof H === 'number' && isFinite(H)) {
      onMeasured?.(H);
    }
  }, [H]);

  // 计算每个 section 的 Y 坐标
  // 页面标题已移至 Canvas 外部，从 contentY 直接开始
  let currentY = contentY;

  // 为每个 section 计算 Y 坐标
  const sectionsWithPos = sections.map((s, i) => {
    const sectionY = currentY;
    currentY += s.sectionH + (i < sections.length - 1 ? sectionGap : 0);
    return { ...s, y: sectionY };
  });

  return (
    <Group data-export-page>
      {/* 编辑模式背景层 - 导出时隐藏 */}
      {!forExport && (
        <Rect x={0} y={0} width={W} height={H} fill="#f5f5f5" />
      )}

      {/* 背景边框 */}
      {borderBmp ? (
        <NineSlice x={0} y={0} w={W} h={H} bmp={borderBmp as any} slice={style.border.slice} />
      ) : (
        <Group />
      )}

      {/* 页面标题已移至 Canvas 外部显示，此处不再渲染 */}

      {/* 渲染每个 section */}
      {sectionsWithPos.map((s, sectionIdx) => {
        // 计算此 section 内部的 Y 坐标
        let sectionCursorY = s.y;
        const titleY = sectionCursorY;
        if (s.titleH) sectionCursorY += s.titleH + gapH;

        const contentY = sectionCursorY;
        if (s.contentH) sectionCursorY += s.contentH + gapH;

        const rewardsY = sectionCursorY;

        return (
          <Group key={sectionIdx}>
            {/* Section 标题 - 水平居中 */}
            {s.section.title ? (
              <Text
                text={s.section.title}
                x={contentX}
                y={titleY}
                width={contentW}
                align="center"
                fontSize={style.font.size}
                fontFamily={style.font.family}
                fill={style.titleColor}
                fontStyle="bold"
              />
            ) : null}

            {/* Section 内容 */}
            {s.section.content ? (
              <Text
                text={s.section.content}
                x={contentX}
                y={contentY}
                width={contentW}
                fontSize={style.font.size}
                fontFamily={style.font.family}
                lineHeight={style.font.lineHeight}
                fill={style.contentColor}
              />
            ) : null}

            {/* Section 奖励网格（3列布局，最后一行居中） */}
            {s.rewards.length > 0 && (
              <Group>
                {Array.from({ length: s.rewardRows }).map((_, row) => {
                  const rowStartIdx = row * rewardColCount;
                  const rowEndIdx = Math.min(rowStartIdx + rewardColCount, s.rewards.length);
                  const rowItemCount = rowEndIdx - rowStartIdx;

                  // 计算该行的最大高度
                  const rowH = rewardRowHeights[`${sectionIdx}-${row}`] || 0;

                  // 计算该行的 Y 坐标
                  let rowY = rewardsY;
                  for (let r = 0; r < row; r++) {
                    rowY += rewardRowHeights[`${sectionIdx}-${r}`] || 0;
                    rowY += rewardGapH;
                  }

                  // 如果是最后一行且不足3个，计算居中的起始 X
                  const isLastRow = row === s.rewardRows - 1;
                  const rowTotalW = rowItemCount * rewardColW + (rowItemCount - 1) * rewardGutterX;
                  const rowStartX = isLastRow && rowItemCount < rewardColCount
                    ? contentX + (contentW - rowTotalW) / 2
                    : contentX;

                  return Array.from({ length: rowItemCount }).map((_, colInRow) => {
                    const rewardIdx = rowStartIdx + colInRow;
                    const x = rowStartX + colInRow * (rewardColW + rewardGutterX);
                    const y = rowY;

                    if (!isFinite(x) || !isFinite(y)) return null;

                    return (
                      <RewardItem
                        key={`${sectionIdx}-${rewardIdx}`}
                        reward={s.rewards[rewardIdx]}
                        x={x}
                        y={y}
                        width={rewardColW}
                        style={style}
                      />
                    );
                  });
                })}
              </Group>
            )}
          </Group>
        );
      })}
    </Group>
  );
}

/**
 * Pure layout computation — no Electron/DOM deps, fully testable.
 */

/** Cell position in the grid (origin-relative to the grid container) */
export interface CellLayout {
  col: number
  row: number
  x: number
  y: number
  width: number
  height: number
}

/** How the non-stage sites are arranged around the stage site. */
export type StageArrangement = 'stage' | 'main-stack'

export interface StageSplit {
  /** The site that sits on stage (after fallback resolution). */
  stageId: string
  /** Sites in the left column (stage mode) — empty for main-stack. */
  leftIds: string[]
  /** Sites in the right column (stage mode) or the single stack column (main-stack). */
  rightIds: string[]
}

export interface StagePlacement {
  colStart: number
  colSpan: number
  rowStart: number
  rowSpan: number
}

export interface StageGridSpec {
  /** CSS `grid-template-columns` value. */
  columns: string
  /** CSS `grid-template-rows` value. */
  rows: string
  /** 1-based CSS grid line placement per site id. */
  placement: Record<string, StagePlacement>
}

/**
 * Choose the column count that maximises individual cell area for the given
 * container dimensions. When multiple layouts yield equal cell area
 * (equivalently, equal `cols × ceil(count/cols)` product), the one whose
 * cell aspect ratio is closest to the container's is preferred, so a 16:9
 * container with 9 sites picks 3×3 over 9×1 or 1×9.
 */
export function autoColumns(
  count: number,
  containerWidth: number,
  containerHeight: number,
): number {
  if (count <= 0) return 1
  if (count === 1) return 1

  const aspect =
    containerWidth > 0 && containerHeight > 0
      ? containerWidth / containerHeight
      : 1

  let bestCols = 1
  // Use integer product cols×rows as proxy for area (smaller = larger cells)
  let bestProduct = Infinity
  let bestAspectDiff = Infinity

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const product = cols * rows
    const cellAspect =
      containerHeight > 0 && rows > 0
        ? containerWidth / cols / (containerHeight / rows)
        : 1
    const aspectDiff = Math.abs(cellAspect - aspect)

    if (
      product < bestProduct ||
      (product === bestProduct && aspectDiff < bestAspectDiff)
    ) {
      bestProduct = product
      bestAspectDiff = aspectDiff
      bestCols = cols
    }
  }

  return bestCols
}

/**
 * Compute grid cell layouts for `count` cells in a container of
 * (containerWidth × containerHeight). The last column and row absorb
 * fractional pixel remainders to avoid gaps.
 *
 * Returns coordinates relative to the container's top-left corner (0,0).
 * The caller is responsible for adding the container's viewport offset.
 */
export function computeLayout(
  count: number,
  columns: number,
  containerWidth: number,
  containerHeight: number,
): CellLayout[] {
  if (count === 0) return []
  const cols = Math.max(1, Math.min(columns, count))
  const rows = Math.ceil(count / cols)
  const baseW = Math.floor(containerWidth / cols)
  const baseH = Math.floor(containerHeight / rows)

  return Array.from({ length: count }, (_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * baseW
    const y = row * baseH
    const isLastCol = col === cols - 1
    const isLastRow = row === rows - 1
    const w = isLastCol ? containerWidth - x : baseW
    const h = isLastRow ? containerHeight - y : baseH
    return { col, row, x, y, width: w, height: h }
  })
}

/**
 * Resolve which site sits on stage and how the remaining sites split into the
 * side columns. Sites keep their given order; with an odd number of sites the
 * stage mode yields perfectly symmetric sides (left = right = (n-1)/2).
 * A stageSiteId that is not among orderedIds (site disabled/removed) falls
 * back to the first site. Returns null when there is no site at all.
 */
export function resolveStageSplit(
  orderedIds: readonly string[],
  stageSiteId: string | null,
): StageSplit | null {
  if (orderedIds.length === 0) return null
  const stageId = stageSiteId !== null && orderedIds.includes(stageSiteId)
    ? stageSiteId
    : orderedIds[0]
  const others = orderedIds.filter(id => id !== stageId)
  const leftCount = Math.ceil(others.length / 2)
  return {
    stageId,
    leftIds: others.slice(0, leftCount),
    rightIds: others.slice(leftCount),
  }
}

/**
 * Express a stage split as a CSS grid. Stage mode is always three tracks —
 * left column, wide stage (2fr), right column — with side sites stacked one
 * per row and the stage site spanning all rows (ratio 25% / 50% / 25%).
 * main-stack is two tracks — wide main (3fr) plus one stack column (1fr).
 * An empty side drops its track; a lone site collapses to a single track.
 */
export function stageGridTemplate(
  split: StageSplit,
  arrangement: StageArrangement,
): StageGridSpec {
  const placement: Record<string, StagePlacement> = {}

  if (split.leftIds.length === 0 && split.rightIds.length === 0) {
    placement[split.stageId] = { colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 }
    return { columns: '1fr', rows: '1fr', placement }
  }

  if (arrangement === 'main-stack') {
    const stackIds = [...split.leftIds, ...split.rightIds]
    const rows = Math.max(1, stackIds.length)
    placement[split.stageId] = { colStart: 1, colSpan: 1, rowStart: 1, rowSpan: rows }
    stackIds.forEach((id, i) => {
      placement[id] = { colStart: 2, colSpan: 1, rowStart: i + 1, rowSpan: 1 }
    })
    return { columns: '3fr 1fr', rows: `repeat(${rows}, 1fr)`, placement }
  }

  const hasLeft = split.leftIds.length > 0
  const hasRight = split.rightIds.length > 0
  const rows = Math.max(1, split.leftIds.length, split.rightIds.length)
  const stageCol = hasLeft ? 2 : 1
  placement[split.stageId] = { colStart: stageCol, colSpan: 1, rowStart: 1, rowSpan: rows }
  split.leftIds.forEach((id, i) => {
    placement[id] = { colStart: 1, colSpan: 1, rowStart: i + 1, rowSpan: 1 }
  })
  split.rightIds.forEach((id, i) => {
    placement[id] = { colStart: stageCol + 1, colSpan: 1, rowStart: i + 1, rowSpan: 1 }
  })
  const tracks = [
    ...(hasLeft ? ['1fr'] : []),
    '2fr',
    ...(hasRight ? ['1fr'] : []),
  ]
  return { columns: tracks.join(' '), rows: `repeat(${rows}, 1fr)`, placement }
}

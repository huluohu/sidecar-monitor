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

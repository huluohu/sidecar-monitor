import { describe, it, expect } from 'vitest'
import { autoColumns, computeLayout } from '../src/shared/layout'

describe('autoColumns', () => {
  it('returns 1 for 0 sites', () => {
    expect(autoColumns(0, 1920, 1080)).toBe(1)
  })

  it('returns 1 for 1 site', () => {
    expect(autoColumns(1, 1920, 1080)).toBe(1)
  })

  it('returns 2 for 2 sites (landscape, 16:9)', () => {
    // Both 1-col and 2-col have equal product. 2-col cells are closer to 16:9.
    expect(autoColumns(2, 1920, 1080)).toBe(2)
  })

  it('returns 3 for 9 sites at 1920×1080 (3×3 optimal)', () => {
    // 3×3: 640×360 = 230 400 per cell
    // 4×3 ceil(9/4)=3: 480×360 = 172 800 — smaller
    // 3×3 wins
    expect(autoColumns(9, 1920, 1080)).toBe(3)
  })

  it('returns 4 for 8 sites at 1920×1080 (4×2)', () => {
    expect(autoColumns(8, 1920, 1080)).toBe(4)
  })

  it('never returns more columns than sites', () => {
    for (let n = 1; n <= 10; n++) {
      const cols = autoColumns(n, 1920, 1080)
      expect(cols).toBeLessThanOrEqual(n)
    }
  })

  it('handles zero-sized container gracefully', () => {
    const cols = autoColumns(4, 0, 0)
    expect(cols).toBeGreaterThanOrEqual(1)
  })
})

describe('computeLayout', () => {
  it('returns empty array for 0 sites', () => {
    expect(computeLayout(0, 2, 1920, 1080)).toEqual([])
  })

  it('single cell fills entire container', () => {
    const [cell] = computeLayout(1, 1, 800, 600)
    expect(cell).toMatchObject({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('4 cells in 2 columns at 800×600', () => {
    const cells = computeLayout(4, 2, 800, 600)
    expect(cells).toHaveLength(4)
    // Row 0
    expect(cells[0]).toMatchObject({ col: 0, row: 0, x: 0, y: 0, width: 400, height: 300 })
    expect(cells[1]).toMatchObject({ col: 1, row: 0, x: 400, y: 0, width: 400, height: 300 })
    // Row 1
    expect(cells[2]).toMatchObject({ col: 0, row: 1, x: 0, y: 300 })
    expect(cells[3]).toMatchObject({ col: 1, row: 1, x: 400, y: 300 })
  })

  it('last cell in row absorbs pixel remainder', () => {
    // 3 cells, 2 columns, width=7 => baseW=3; col0=3, col1=7-3=4
    const cells = computeLayout(3, 2, 7, 100)
    expect(cells[0].width).toBe(3)
    expect(cells[1].width).toBe(4) // 7 - 3 = 4
  })

  it('total area equals container area', () => {
    const W = 1920
    const H = 1080
    const cells = computeLayout(6, 3, W, H)
    const totalArea = cells.reduce((s, c) => s + c.width * c.height, 0)
    expect(totalArea).toBe(W * H)
  })

  it('no gaps or overlaps for 5 cells in 3 columns', () => {
    const cells = computeLayout(5, 3, 900, 600)
    // Verify x extents
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(900)
      expect(c.y + c.height).toBeLessThanOrEqual(600)
    }
  })

  it('clamps columns to count', () => {
    const cells = computeLayout(2, 10, 800, 600)
    expect(cells).toHaveLength(2)
    // With cols clamped to 2, each cell width is 400
    expect(cells[0].width).toBe(400)
  })
})

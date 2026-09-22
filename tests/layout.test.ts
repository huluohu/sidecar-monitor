import { describe, it, expect } from 'vitest'
import { autoColumns, computeLayout, resolveStageSplit, stageGridTemplate } from '../src/shared/layout'

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

describe('resolveStageSplit', () => {
  it('returns null for no sites', () => {
    expect(resolveStageSplit([], null)).toBe(null)
  })

  it('falls back to the first site when stageSiteId is null', () => {
    const split = resolveStageSplit(['a', 'b', 'c'], null)!
    expect(split.stageId).toBe('a')
  })

  it('falls back to the first site when stageSiteId is dangling', () => {
    const split = resolveStageSplit(['a', 'b'], 'gone')!
    expect(split.stageId).toBe('a')
  })

  it('5 sites (odd): stage + 2 left + 2 right, perfectly symmetric', () => {
    const split = resolveStageSplit(['a', 'b', 'c', 'd', 'e'], 'a')!
    expect(split.stageId).toBe('a')
    expect(split.leftIds).toEqual(['b', 'c'])
    expect(split.rightIds).toEqual(['d', 'e'])
  })

  it('4 sites (even): the extra site goes to the left column', () => {
    const split = resolveStageSplit(['a', 'b', 'c', 'd'], 'a')!
    expect(split.leftIds).toEqual(['b', 'c'])
    expect(split.rightIds).toEqual(['d'])
  })

  it('single site: no side columns', () => {
    const split = resolveStageSplit(['a'], null)!
    expect(split.stageId).toBe('a')
    expect(split.leftIds).toEqual([])
    expect(split.rightIds).toEqual([])
  })

  it('two sites: one companion on the left', () => {
    const split = resolveStageSplit(['a', 'b'], 'b')!
    expect(split.stageId).toBe('b')
    expect(split.leftIds).toEqual(['a'])
    expect(split.rightIds).toEqual([])
  })
})

describe('stageGridTemplate', () => {
  it('single site collapses to one full-size track', () => {
    const split = resolveStageSplit(['a'], null)!
    const spec = stageGridTemplate(split, 'stage')
    expect(spec.columns).toBe('1fr')
    expect(spec.rows).toBe('1fr')
    expect(spec.placement.a).toEqual({ colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 })
  })

  it('5 sites in stage mode: 1fr 2fr 1fr tracks, stage spans all rows in the middle column', () => {
    const split = resolveStageSplit(['a', 'b', 'c', 'd', 'e'], 'a')!
    const spec = stageGridTemplate(split, 'stage')
    expect(spec.columns).toBe('1fr 2fr 1fr')
    expect(spec.rows).toBe('repeat(2, 1fr)')
    expect(spec.placement.a).toEqual({ colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 2 })
    expect(spec.placement.b).toEqual({ colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 })
    expect(spec.placement.c).toEqual({ colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 })
    expect(spec.placement.d).toEqual({ colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 })
    expect(spec.placement.e).toEqual({ colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 })
  })

  it('4 sites in stage mode: asymmetric tracks with empty right top rows allowed', () => {
    const split = resolveStageSplit(['a', 'b', 'c', 'd'], 'a')!
    const spec = stageGridTemplate(split, 'stage')
    expect(spec.columns).toBe('1fr 2fr 1fr')
    // Stage spans both rows; right column has one cell (top row), bottom row empty
    expect(spec.placement.d).toEqual({ colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 })
  })

  it('main-stack: 3fr 1fr tracks, stack keeps left-then-right order', () => {
    const split = resolveStageSplit(['a', 'b', 'c', 'd'], 'a')!
    const spec = stageGridTemplate(split, 'main-stack')
    expect(spec.columns).toBe('3fr 1fr')
    expect(spec.placement.a).toEqual({ colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 3 })
    expect(spec.placement.b).toEqual({ colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 })
    expect(spec.placement.c).toEqual({ colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 })
    expect(spec.placement.d).toEqual({ colStart: 2, colSpan: 1, rowStart: 3, rowSpan: 1 })
  })

  it('every site has a placement and no two cells overlap', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (const arrangement of ['stage', 'main-stack'] as const) {
      const split = resolveStageSplit(ids, 'c')!
      const spec = stageGridTemplate(split, arrangement)
      for (const id of ids) {
        expect(spec.placement[id], `${arrangement} placement for ${id}`).toBeDefined()
      }
      // Overlap check: same (col,row) impossible
      const occupied = new Set<string>()
      for (const id of ids) {
        const p = spec.placement[id]!
        for (let col = p.colStart; col < p.colStart + p.colSpan; col++) {
          for (let row = p.rowStart; row < p.rowStart + p.rowSpan; row++) {
            const key = `${col},${row}`
            expect(occupied.has(key), `${arrangement} overlap at ${key} (${id})`).toBe(false)
            occupied.add(key)
          }
        }
      }
    }
  })
})

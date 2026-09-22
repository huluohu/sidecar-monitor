/**
 * Re-export layout utilities for use in renderer.
 * Keeps shared/ as the single source of truth.
 */
export {
  autoColumns,
  computeLayout,
  resolveStageSplit,
  stageGridTemplate,
} from '@shared/layout'
export type { CellLayout, StagePlacement } from '@shared/layout'

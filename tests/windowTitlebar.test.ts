import { describe, expect, it } from 'vitest'
import {
  getWindowTitlebarOptions,
  WINDOW_TOOLBAR_HEIGHT,
} from '../src/main/windowTitlebar'

describe('getWindowTitlebarOptions', () => {
  it('uses hiddenInset with native traffic lights on macOS', () => {
    expect(getWindowTitlebarOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 15 },
    })
  })

  it.each(['win32', 'linux'] as const)(
    'uses Window Controls Overlay on %s',
    platform => {
      expect(getWindowTitlebarOptions(platform)).toEqual({
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#1a2535',
          symbolColor: '#c8d4e4',
          height: WINDOW_TOOLBAR_HEIGHT,
        },
      })
    },
  )

  it('does not apply unsupported platform-specific options', () => {
    expect(getWindowTitlebarOptions('aix')).toEqual({})
  })
})

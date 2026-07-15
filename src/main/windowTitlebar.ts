import type { BrowserWindowConstructorOptions } from 'electron'

export const WINDOW_TOOLBAR_HEIGHT = 44

type WindowTitlebarOptions = Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'titleBarOverlay' | 'trafficLightPosition'
>

export function getWindowTitlebarOptions(platform: NodeJS.Platform): WindowTitlebarOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 15 },
    }
  }

  if (platform === 'win32' || platform === 'linux') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#1a2535',
        symbolColor: '#c8d4e4',
        height: WINDOW_TOOLBAR_HEIGHT,
      },
    }
  }

  return {}
}

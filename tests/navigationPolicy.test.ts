import { describe, it, expect } from 'vitest'
import {
  createNavigationState,
  onWillNavigate,
  onWillRedirect,
  onDidNavigate,
  onDidFailLoad,
  type NavigationState,
} from '../src/shared/urlPolicy'

const CONFIGURED = 'https://app.example.com/dashboard'

function freshState(): NavigationState {
  return createNavigationState(CONFIGURED)
}

// ---------------------------------------------------------------------------
// createNavigationState
// ---------------------------------------------------------------------------

describe('createNavigationState', () => {
  it('initialises trustedOrigin to the configured URL origin', () => {
    const s = freshState()
    expect(s.trustedOrigin).toBe('https://app.example.com')
    expect(s.pendingRedirect).toBe(false)
  })

  it('handles a port in the configured URL', () => {
    const s = createNavigationState('http://monitor.local:3000/ui')
    expect(s.trustedOrigin).toBe('http://monitor.local:3000')
  })

  it('trustedOrigin is empty for a non-http configured URL (fail-closed)', () => {
    const s = createNavigationState('file:///app/index.html')
    expect(s.trustedOrigin).toBe('')
  })
})

// ---------------------------------------------------------------------------
// onWillNavigate — main frame
// ---------------------------------------------------------------------------

describe('onWillNavigate — main frame', () => {
  it('allows same-origin navigation', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'https://app.example.com/login', true)).toBe('allow')
    expect(onWillNavigate(s, 'https://app.example.com/', true)).toBe('allow')
    expect(onWillNavigate(s, 'https://app.example.com/settings?tab=2', true)).toBe('allow')
  })

  it('blocks direct cross-origin main-frame navigation', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'https://evil.com/', true)).toBe('block')
    expect(onWillNavigate(s, 'https://auth.other.com/sso', true)).toBe('block')
    expect(onWillNavigate(s, 'http://app.example.com/', true)).toBe('block') // different scheme
  })

  it('blocks non-http(s) in main frame', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'file:///etc/passwd', true)).toBe('block')
    expect(onWillNavigate(s, 'javascript:void(0)', true)).toBe('block')
    expect(onWillNavigate(s, 'data:text/html,x', true)).toBe('block')
    expect(onWillNavigate(s, 'blob:null/id', true)).toBe('block')
    expect(onWillNavigate(s, '', true)).toBe('block')
  })

  it('clears pendingRedirect on new user/script navigation', () => {
    const s = freshState()
    s.pendingRedirect = true
    onWillNavigate(s, 'https://app.example.com/page', true)
    expect(s.pendingRedirect).toBe(false)
  })

  it('clears pendingRedirect even for blocked cross-origin navigations', () => {
    const s = freshState()
    s.pendingRedirect = true
    onWillNavigate(s, 'https://evil.com/', true)
    expect(s.pendingRedirect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// onWillNavigate — subframe
// ---------------------------------------------------------------------------

describe('onWillNavigate — subframe', () => {
  it('allows http(s) subframe navigation regardless of origin', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'https://other.com/embed', false)).toBe('allow')
    expect(onWillNavigate(s, 'http://cdn.example.com/frame', false)).toBe('allow')
    expect(onWillNavigate(s, 'https://app.example.com/inner', false)).toBe('allow')
  })

  it('blocks non-http(s) subframe navigation', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'file:///etc/hosts', false)).toBe('block')
    expect(onWillNavigate(s, 'javascript:void(0)', false)).toBe('block')
    expect(onWillNavigate(s, 'data:text/html,<b>x</b>', false)).toBe('block')
  })

  it('does not update trustedOrigin for subframe navigation', () => {
    const s = freshState()
    onWillNavigate(s, 'https://other.com/embed', false)
    expect(s.trustedOrigin).toBe('https://app.example.com')
  })
})

// ---------------------------------------------------------------------------
// onWillRedirect — server-side 3xx
// ---------------------------------------------------------------------------

describe('onWillRedirect', () => {
  it('allows same-origin server redirect', () => {
    const s = freshState()
    expect(onWillRedirect(s, 'https://app.example.com/new', true)).toBe('allow')
  })

  it('allows cross-origin server redirect (multi-hop chain)', () => {
    const s = freshState()
    expect(onWillRedirect(s, 'https://auth.other.com/callback', true)).toBe('allow')
    expect(onWillRedirect(s, 'https://idp.corp.com/sso', true)).toBe('allow')
  })

  it('marks pendingRedirect=true for main-frame redirect', () => {
    const s = freshState()
    onWillRedirect(s, 'https://auth.other.com/callback', true)
    expect(s.pendingRedirect).toBe(true)
  })

  it('does NOT set pendingRedirect for subframe redirect', () => {
    const s = freshState()
    onWillRedirect(s, 'https://tracking.other.com/pixel', false)
    expect(s.pendingRedirect).toBe(false)
  })

  it('does not change trustedOrigin during redirect (only commit does)', () => {
    const s = freshState()
    onWillRedirect(s, 'https://auth.other.com/callback', true)
    expect(s.trustedOrigin).toBe('https://app.example.com')
  })

  it('blocks non-http(s) main-frame redirect targets', () => {
    const s = freshState()
    expect(onWillRedirect(s, 'file:///etc/passwd', true)).toBe('block')
    expect(onWillRedirect(s, 'javascript:alert(1)', true)).toBe('block')
    expect(onWillRedirect(s, 'data:text/html,x', true)).toBe('block')
    expect(onWillRedirect(s, 'blob:null/id', true)).toBe('block')
    expect(onWillRedirect(s, '', true)).toBe('block')
  })

  it('blocks non-http(s) subframe redirect targets', () => {
    const s = freshState()
    expect(onWillRedirect(s, 'javascript:void(0)', false)).toBe('block')
    expect(onWillRedirect(s, 'file:///x', false)).toBe('block')
  })
})

// ---------------------------------------------------------------------------
// Cross-origin multi-hop redirect chain
// ---------------------------------------------------------------------------

describe('cross-origin multi-hop redirect chain', () => {
  it('allows A → SSO (cross-origin) → back to A, locks trustedOrigin at commit', () => {
    const s = freshState()

    // Hop 1: app → SSO identity provider
    expect(onWillRedirect(s, 'https://sso.idp.com/login', true)).toBe('allow')
    expect(s.pendingRedirect).toBe(true)
    expect(s.trustedOrigin).toBe('https://app.example.com') // not yet updated

    // Hop 2: SSO → back to app
    expect(onWillRedirect(s, 'https://app.example.com/home', true)).toBe('allow')
    expect(s.pendingRedirect).toBe(true)

    // Commit at final URL
    const result = onDidNavigate(s, 'https://app.example.com/home')
    expect(result).toBe('committed')
    expect(s.trustedOrigin).toBe('https://app.example.com')
    expect(s.pendingRedirect).toBe(false)
  })

  it('locks trustedOrigin to a cross-origin final URL after redirect', () => {
    const s = freshState()
    // App permanently moves to a new domain
    onWillRedirect(s, 'https://newdomain.com/app', true)
    onDidNavigate(s, 'https://newdomain.com/app')

    expect(s.trustedOrigin).toBe('https://newdomain.com')

    // Same-origin to new domain is allowed
    expect(onWillNavigate(s, 'https://newdomain.com/settings', true)).toBe('allow')
    // Old domain is now blocked for direct navigation
    expect(onWillNavigate(s, 'https://app.example.com/dashboard', true)).toBe('block')
  })

  it('three-hop chain: A → B → C → D, trustedOrigin = D after commit', () => {
    const s = freshState()
    onWillRedirect(s, 'https://hop1.com/', true)
    onWillRedirect(s, 'https://hop2.com/', true)
    onWillRedirect(s, 'https://final.com/landing', true)
    onDidNavigate(s, 'https://final.com/landing')
    expect(s.trustedOrigin).toBe('https://final.com')
  })
})

// ---------------------------------------------------------------------------
// Direct cross-origin block before and after redirect
// ---------------------------------------------------------------------------

describe('direct cross-origin navigation — blocked before and after redirect', () => {
  it('blocks direct cross-origin will-navigate before any redirect has occurred', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'https://evil.com/', true)).toBe('block')
  })

  it('blocks direct cross-origin will-navigate even after a redirect chain completes', () => {
    const s = freshState()
    onWillRedirect(s, 'https://newapp.com/landing', true)
    onDidNavigate(s, 'https://newapp.com/landing')

    // Script/user tries to navigate cross-origin → blocked
    expect(onWillNavigate(s, 'https://evil.com/', true)).toBe('block')
    expect(onWillNavigate(s, 'https://app.example.com/', true)).toBe('block')
  })

  it('does not permit cross-origin will-navigate that happens to match an in-flight redirect target', () => {
    const s = freshState()
    // Mid-chain: server redirected to auth.other.com (pendingRedirect=true)
    onWillRedirect(s, 'https://auth.other.com/', true)
    expect(s.pendingRedirect).toBe(true)

    // A script tries will-navigate to the same origin that the redirect pointed to
    // This must still be blocked because trustedOrigin hasn't changed yet
    expect(onWillNavigate(s, 'https://auth.other.com/page', true)).toBe('block')
    // And pendingRedirect was cleared by the will-navigate
    expect(s.pendingRedirect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subframe redirects
// ---------------------------------------------------------------------------

describe('subframe redirects', () => {
  it('allows cross-origin subframe redirect and does NOT update trustedOrigin', () => {
    const s = freshState()
    expect(onWillRedirect(s, 'https://tracking.other.com/pixel', false)).toBe('allow')
    expect(s.trustedOrigin).toBe('https://app.example.com')
    expect(s.pendingRedirect).toBe(false)
  })

  it('multiple subframe redirects do not affect main-frame trustedOrigin', () => {
    const s = freshState()
    onWillRedirect(s, 'https://ads.com/x', false)
    onWillRedirect(s, 'https://analytics.com/y', false)
    expect(s.trustedOrigin).toBe('https://app.example.com')
    expect(s.pendingRedirect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// onDidNavigate
// ---------------------------------------------------------------------------

describe('onDidNavigate', () => {
  it('returns committed and updates trustedOrigin for http(s)', () => {
    const s = freshState()
    expect(onDidNavigate(s, 'https://newdomain.com/page')).toBe('committed')
    expect(s.trustedOrigin).toBe('https://newdomain.com')
  })

  it('returns committed for http (not https)', () => {
    const s = freshState()
    expect(onDidNavigate(s, 'http://internal.local:8080/app')).toBe('committed')
    expect(s.trustedOrigin).toBe('http://internal.local:8080')
  })

  it('returns blank and keeps trustedOrigin for about:blank', () => {
    const s = freshState()
    const originalOrigin = s.trustedOrigin
    expect(onDidNavigate(s, 'about:blank')).toBe('blank')
    expect(s.trustedOrigin).toBe(originalOrigin)
  })

  it('returns non-http for unexpected non-http(s) schemes', () => {
    const s = freshState()
    expect(onDidNavigate(s, 'file:///index.html')).toBe('non-http')
    expect(onDidNavigate(s, 'data:text/html,x')).toBe('non-http')
    expect(onDidNavigate(s, 'blob:null/abc')).toBe('non-http')
  })

  it('always clears pendingRedirect regardless of result', () => {
    for (const url of [
      'https://app.example.com/home',
      'about:blank',
      'file:///index.html',
    ]) {
      const s = freshState()
      s.pendingRedirect = true
      onDidNavigate(s, url)
      expect(s.pendingRedirect).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// onDidFailLoad
// ---------------------------------------------------------------------------

describe('onDidFailLoad', () => {
  it('clears pendingRedirect on failed main-frame load', () => {
    const s = freshState()
    s.pendingRedirect = true
    onDidFailLoad(s)
    expect(s.pendingRedirect).toBe(false)
  })

  it('does not change trustedOrigin', () => {
    const s = freshState()
    const original = s.trustedOrigin
    onDidFailLoad(s)
    expect(s.trustedOrigin).toBe(original)
  })
})

// ---------------------------------------------------------------------------
// Stale pendingRedirect reset
// ---------------------------------------------------------------------------

describe('stale pendingRedirect reset', () => {
  it('clears pendingRedirect when will-navigate fires mid-redirect-chain', () => {
    const s = freshState()
    onWillRedirect(s, 'https://sso.idp.com/login', true) // pendingRedirect = true
    expect(s.pendingRedirect).toBe(true)
    // New renderer navigation supersedes the in-flight redirect
    onWillNavigate(s, 'https://app.example.com/home', true)
    expect(s.pendingRedirect).toBe(false)
  })

  it('clears pendingRedirect on main-frame failed load', () => {
    const s = freshState()
    onWillRedirect(s, 'https://sso.idp.com/login', true)
    expect(s.pendingRedirect).toBe(true)
    onDidFailLoad(s)
    expect(s.pendingRedirect).toBe(false)
  })

  it('clears pendingRedirect on successful commit', () => {
    const s = freshState()
    onWillRedirect(s, 'https://sso.idp.com/login', true)
    expect(s.pendingRedirect).toBe(true)
    onDidNavigate(s, 'https://app.example.com/home')
    expect(s.pendingRedirect).toBe(false)
  })

  it('subsequent navigation after stale reset uses updated trustedOrigin', () => {
    const s = freshState()
    // Redirect chain lands and commits
    onWillRedirect(s, 'https://newdomain.com/', true)
    onDidNavigate(s, 'https://newdomain.com/')
    expect(s.trustedOrigin).toBe('https://newdomain.com')

    // Later: a new redirect chain starts (pendingRedirect=true again)
    onWillRedirect(s, 'https://auth.newdomain.com/login', true)
    // A will-navigate fires (clears pendingRedirect)
    onWillNavigate(s, 'https://newdomain.com/home', true) // allowed, same as current trustedOrigin
    expect(s.pendingRedirect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Malformed and non-http targets
// ---------------------------------------------------------------------------

describe('malformed and non-http targets', () => {
  it('blocks malformed URLs in will-navigate (main frame)', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'not-a-url', true)).toBe('block')
    expect(onWillNavigate(s, '//no-scheme.com', true)).toBe('block')
    expect(onWillNavigate(s, 'ftp://old.example.com', true)).toBe('block')
  })

  it('blocks malformed URLs in will-redirect', () => {
    const s = freshState()
    expect(onWillRedirect(s, 'not-a-url', true)).toBe('block')
    expect(onWillRedirect(s, '', true)).toBe('block')
    expect(onWillRedirect(s, 'ftp://files.example.com', true)).toBe('block')
  })

  it('blocks URLs with credentials (username:password) in will-navigate', () => {
    const s = freshState()
    expect(onWillNavigate(s, 'https://user:pass@app.example.com/', true)).toBe('block')
  })

  it('blocks URLs with credentials in will-redirect', () => {
    const s = freshState()
    expect(onWillRedirect(s, 'https://user:pass@app.example.com/', true)).toBe('block')
  })
})

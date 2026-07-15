import { describe, it, expect } from 'vitest'
import { isHttpUrl, isSameOrigin, classifyNavigation, getOrigin } from '../src/shared/urlPolicy'

describe('isHttpUrl', () => {
  it('accepts http/https', () => {
    expect(isHttpUrl('http://site.local:8080')).toBe(true)
    expect(isHttpUrl('https://secure.example.com/path')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isHttpUrl('javascript:void(0)')).toBe(false)
    expect(isHttpUrl('data:text/html,x')).toBe(false)
    expect(isHttpUrl('blob:null/abc')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })
})

describe('isSameOrigin', () => {
  it('same origin returns true', () => {
    expect(isSameOrigin('https://a.com/path', 'https://a.com/other')).toBe(true)
    expect(isSameOrigin('http://site:8080/x', 'http://site:8080/y')).toBe(true)
  })

  it('different origin returns false', () => {
    expect(isSameOrigin('https://a.com', 'https://b.com')).toBe(false)
    expect(isSameOrigin('https://a.com', 'http://a.com')).toBe(false) // different scheme
    expect(isSameOrigin('https://a.com:80', 'https://a.com:443')).toBe(false)
  })

  it('handles malformed URLs gracefully', () => {
    expect(isSameOrigin('not-a-url', 'https://a.com')).toBe(false)
  })
})

describe('getOrigin', () => {
  it('extracts origin from http/https URLs', () => {
    expect(getOrigin('https://app.example.com/dashboard')).toBe('https://app.example.com')
    expect(getOrigin('http://site.local:8080/path')).toBe('http://site.local:8080')
    expect(getOrigin('https://example.com')).toBe('https://example.com')
  })

  it('returns empty string for non-http(s) protocols', () => {
    expect(getOrigin('file:///etc/passwd')).toBe('')
    expect(getOrigin('javascript:void(0)')).toBe('')
    expect(getOrigin('data:text/html,x')).toBe('')
    expect(getOrigin('blob:null/id')).toBe('')
  })

  it('returns empty string for malformed URLs', () => {
    expect(getOrigin('')).toBe('')
    expect(getOrigin('not-a-url')).toBe('')
  })

  it('origin string is itself a valid origin (round-trips through isSameOrigin)', () => {
    const origin = getOrigin('https://app.example.com/dashboard')
    expect(isSameOrigin('https://app.example.com/login', origin)).toBe(true)
    expect(isSameOrigin('https://other.com/', origin)).toBe(false)
  })
})

describe('classifyNavigation', () => {
  const configured = 'https://site.example.com/dashboard'

  it('same-origin → allow', () => {
    expect(classifyNavigation('https://site.example.com/login', configured)).toBe('allow')
    expect(classifyNavigation('https://site.example.com/', configured)).toBe('allow')
  })

  it('cross-origin http(s) → external', () => {
    expect(classifyNavigation('https://auth.other.com/sso', configured)).toBe('external')
    expect(classifyNavigation('http://docs.example.com', configured)).toBe('external')
  })

  it('non-http protocol → block', () => {
    expect(classifyNavigation('file:///etc/passwd', configured)).toBe('block')
    expect(classifyNavigation('javascript:alert(1)', configured)).toBe('block')
    expect(classifyNavigation('data:text/html,x', configured)).toBe('block')
    expect(classifyNavigation('blob:null/id', configured)).toBe('block')
    expect(classifyNavigation('', configured)).toBe('block')
  })
})

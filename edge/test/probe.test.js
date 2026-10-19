import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, parsePixelHit, pixelConfigId, withTestTags, duplicateEventNames, TEST_TAGS } from '../src/probe.js'
import { passesDigitCheck } from '../src/explain.js'
import { cleanUrl } from '../src/util.js'

const base = (over = {}) => ({ status: 200, finalUrl: withTestTags('https://shop.example.com/p/1'), redirects: ['https://shop.example.com/p/1'], loadMs: 2100, hits: [{ id: '123456789', ev: 'PageView' }], configIds: ['123456789'], consent: false, challenge: false, requests: [], error: null, ...over })
const url = 'https://shop.example.com/p/1'

test('healthy page', () => {
  const { probe, findings } = classify(base(), { url })
  assert.equal(probe.state, 'ok')
  assert.equal(probe.tagsKept, true)
  assert.equal(findings[0].id, 'ok')
  assert.equal(probe.url, url)
})

test('404, slow, lost tags, no pixel', () => {
  assert.equal(classify(base({ status: 404 }), { url }).findings[0].id, 'P1')
  assert.ok(classify(base({ loadMs: 6200 }), { url }).findings.some(f => f.id === 'P2'))
  const lost = classify(base({ finalUrl: 'https://shop.example.com/p/1', redirects: ['https://bit.ly/x', 'https://shop.example.com/p/1'] }), { url })
  assert.equal(lost.probe.tagsKept, false)
  assert.ok(lost.findings.some(f => f.id === 'P3'))
  const none = classify(base({ hits: [], configIds: [] }), { url })
  assert.equal(none.probe.state, 'issue')
  assert.ok(none.findings.some(f => f.id === 'T1'))
})

test('consent banner and silent pixel are "couldn\'t confirm", not leaks', () => {
  assert.equal(classify(base({ hits: [], configIds: [], consent: true }), { url }).probe.state, 'unconfirmed')
  assert.equal(classify(base({ hits: [] }), { url }).probe.state, 'unconfirmed')
})

test('off-domain landing and wrong pixel', () => {
  assert.ok(classify(base({ finalUrl: 'https://other.com/' }), { url }).findings.some(f => f.id === 'P1'))
  assert.ok(classify(base(), { url, pixelId: '999999999' }).findings.some(f => f.id === 'T2'))
  assert.ok(!classify(base(), { url, pixelId: '123456789' }).findings.some(f => f.id === 'T2'))
})

test('duplicates need two copies Meta cannot merge', () => {
  assert.deepEqual(duplicateEventNames([{ name: 'PageView', pixelId: '1' }]), [])
  assert.deepEqual(duplicateEventNames([{ name: 'PageView', pixelId: '1', eventId: 'a' }, { name: 'PageView', pixelId: '1', eventId: 'a' }]), [])
  assert.deepEqual(duplicateEventNames([{ name: 'PageView', pixelId: '1' }, { name: 'PageView', pixelId: '1' }]), ['PageView'])
  assert.deepEqual(duplicateEventNames([{ name: 'Purchase', pixelId: '1', eventId: 'a' }, { name: 'Purchase', pixelId: '1' }]), ['Purchase'])
  assert.deepEqual(duplicateEventNames([{ name: 'PageView', pixelId: '1' }, { name: 'PageView', pixelId: '2' }]), [])
})

test('blocked and failed opens', () => {
  assert.equal(classify(base({ challenge: true, status: 403 }), { url }).probe.state, 'blocked')
  assert.equal(classify(base({ status: null, error: 'timeout' }), { url }).probe.state, 'blocked')
})

test('pixel hits from GET and POST', () => {
  assert.deepEqual(parsePixelHit('https://www.facebook.com/tr/?id=42424242&ev=PageView&eid=x1'), { id: '42424242', ev: 'PageView', eid: 'x1' })
  assert.deepEqual(parsePixelHit('https://www.facebook.com/tr/', 'id=42424242&ev=Purchase'), { id: '42424242', ev: 'Purchase', eid: undefined })
  assert.equal(parsePixelHit('https://www.facebook.com/privacy_sandbox/pixel/register/trigger/?id=1&ev=PageView'), null)
  assert.equal(pixelConfigId('https://connect.facebook.net/signals/config/1234567890?v=2.9'), '1234567890')
  assert.equal(new URL(withTestTags(url)).searchParams.get('fbclid'), TEST_TAGS.fbclid)
})

test('urls: add https, refuse private networks', () => {
  assert.equal(cleanUrl('shop.example.com/a#x'), 'https://shop.example.com/a')
  assert.throws(() => cleanUrl('http://localhost:3000'))
  assert.throws(() => cleanUrl('http://192.168.1.4/'))
  assert.throws(() => cleanUrl('not a url'))
})

test('model text may only use numbers from the evidence', () => {
  const leak = { title: 'Page takes 6.2 s on phones', summary: 'Only 41% of clicks wait.', facts: [{ label: 'Spent', value: '₹12,400' }], fixSteps: [] }
  assert.ok(passesDigitCheck('It takes 6.2 s and you spent ₹12,400.', leak))
  assert.ok(!passesDigitCheck('You lose about 30% of buyers.', leak))
})

test('tag manager without a visible pixel is "couldn\'t confirm"; rate limits are "couldn\'t check"', () => {
  const tm = classify(base({ hits: [], configIds: [], tagManager: true }), { url })
  assert.equal(tm.probe.state, 'unconfirmed')
  assert.ok(!tm.findings.some(f => f.id === 'T1'))
  assert.equal(classify(base({ status: 429 }), { url }).probe.state, 'blocked')
  assert.equal(classify(base({ status: 404 }), { url }).probe.state, 'issue')
})

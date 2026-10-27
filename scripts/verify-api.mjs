// End-to-end acceptance against the HTTP server and a real, isolated MySQL schema.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.argv[2] || 'http://127.0.0.1:3000'
const reportPath = process.argv[3] || 'deployment/evidence/api-verification.json'
const checks = []
let completed = false
async function request(path, status, validate, options = {}) {
  const response = await fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(12000) })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = null }
  try {
    assert.equal(response.status, status)
    assert.match(response.headers.get('content-type') || '', /application\/json/)
    assert.match(response.headers.get('cache-control') || '', /no-store/)
    assert(!/password|ER_ACCESS_DENIED|SELECT\s|mysql:\/\//i.test(text))
    await validate(body, response)
    checks.push({ path, method: options.method || 'GET', status, passed: true })
    return body
  } catch (error) {
    checks.push({ path, method: options.method || 'GET', actual_status: response.status, passed: false, error: error.message })
    throw error
  }
}

try {
  if (process.env.EXPECT_DATABASE_UNAVAILABLE === '1') {
    await request('/api/component/1', 503, body => assert.match(body.error, /^database_(not_configured|unavailable)$/))
    await request('/api/health', 503, body => assert.equal(body.status, 'not_ready'))
  } else {
    await request('/api/health', 200, body => assert.equal(body.status, 'ready'))
    for (let id = 1; id <= 6; id++) {
      await request(`/api/component/${id}`, 200, body => {
        assert.equal(body.base_info.ID, id)
        assert.equal(typeof body.base_info.Name, 'string')
        assert(Array.isArray(body.maintenance_history))
        assert(body.maintenance_history.every(record => record.ComponentID === id))
      })
    }
    // Fixtures are inserted only into the explicitly isolated test database.
    if (process.env.EXPECT_E2E_FIXTURES === '1') {
      await request('/api/component/1', 200, body => {
        assert.equal(body.maintenance_history.length, 2)
        assert.equal(body.maintenance_history[0].IssueDescription, 'E2E 专用：较新检查记录')
        assert.equal(body.maintenance_history[1].IssueDescription, 'E2E 专用：较早检查记录')
      })
    }
    await request('/api/component/999999999', 404, body => assert.equal(body.error, 'component_not_found'))
    // Exercise concurrent access beyond the pool size; connections must be returned.
    const responses = await Promise.all(Array.from({ length: 12 }, () =>
      fetch(new URL('/api/component/6', base), { signal: AbortSignal.timeout(12000) })))
    for (const response of responses) assert.equal(response.status, 200)
    checks.push({ path: '/api/component/6', concurrent_requests: responses.length, passed: true })
  }
  for (const id of ['0', '-1', 'abc', '1%20OR%201=1', '99999999999999999999', '%E0%A4%A']) {
    await request(`/api/component/${id}`, 400, body => assert.equal(body.error, 'invalid_component_id'))
  }
  await request('/api/component/1', 405, (body, response) => {
    assert.equal(body.error, 'method_not_allowed')
    assert.equal(response.headers.get('allow'), 'GET')
  }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  completed = true
} finally {
  const { dirname } = await import('node:path')
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify({ checked_at: new Date().toISOString(), base_url: base,
    mode: process.env.EXPECT_DATABASE_UNAVAILABLE === '1' ? 'unavailable' : 'real-mysql',
    passed: completed && checks.length > 0 && checks.every(check => check.passed), checks }, null, 2) + '\n')
  console.log(`HTTP acceptance report: ${reportPath} (${checks.length} checks)`)
}

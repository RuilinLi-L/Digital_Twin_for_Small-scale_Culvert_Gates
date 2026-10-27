import { DatabaseConfigurationError } from './database.js'

export function json(response, status, body) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.statusCode = status
  response.end(JSON.stringify(body))
}

export function requireGet(request, response) {
  if (request.method === 'GET') return true
  response.setHeader('Allow', 'GET')
  json(response, 405, { error: 'method_not_allowed' })
  return false
}

export function databaseFailure(response, error, extra = {}) {
  // Log a classification only; driver messages can contain connection details.
  console.error('[database request failed]', error instanceof DatabaseConfigurationError ? 'configuration' : (error.code || 'unknown'))
  json(response, 503, {
    ...extra,
    error: error instanceof DatabaseConfigurationError ? 'database_not_configured' : 'database_unavailable',
    message: error instanceof DatabaseConfigurationError ? '数据服务尚未配置' : '数据服务暂时不可用，请稍后重试'
  })
}

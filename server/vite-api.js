import component from '../api/component/[id].js'
import health from '../api/health.js'
import { json } from './http.js'

export function localApi() {
  const middleware = async (request, response, next) => {
    const path = new URL(request.url, 'http://localhost').pathname
    if (!path.startsWith('/api/')) return next()
    try {
      if (path === '/api/health') return await health(request, response)
      if (/^\/api\/component\/[^/]+\/?$/.test(path)) return await component(request, response)
      json(response, 404, { error: 'api_not_found' })
    } catch {
      if (!response.headersSent) json(response, 500, { error: 'internal_error' })
      else response.end()
    }
  }
  return {
    name: 'local-component-api',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) }
  }
}

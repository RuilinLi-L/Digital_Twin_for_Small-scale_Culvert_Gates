import { getDatabasePool } from '../../server/database.js'
import { databaseFailure, json, requireGet } from '../../server/http.js'

export default async function handler(request, response) {
  if (!requireGet(request, response)) return
  let id
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    id = decodeURIComponent(path.match(/^\/api\/component\/([^/]+)\/?$/)?.[1] || '')
  } catch {
    return json(response, 400, { error: 'invalid_component_id' })
  }
  if (!/^[1-9]\d{0,8}$/.test(id)) return json(response, 400, { error: 'invalid_component_id' })

  let connection
  try {
    connection = await getDatabasePool().getConnection()
    const [components] = await connection.execute({
      sql: 'SELECT ID, Name, Material, Specification FROM Components WHERE ID = ?', timeout: 3000
    }, [Number(id)])
    if (!components.length) return json(response, 404, { error: 'component_not_found', message: '未找到该构件' })
    const [records] = await connection.execute({
      sql: `SELECT ID, ComponentID, MaintenanceTime, ActionTaken, IssueDescription, ResponsiblePerson
       FROM MaintenanceRecords WHERE ComponentID = ? ORDER BY MaintenanceTime DESC, ID DESC`, timeout: 3000
    }, [Number(id)])
    json(response, 200, { base_info: components[0], maintenance_history: records })
  } catch (error) {
    databaseFailure(response, error)
  } finally {
    connection?.release()
  }
}

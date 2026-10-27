import { getDatabasePool } from '../server/database.js'
import { databaseFailure, json, requireGet } from '../server/http.js'

export default async function handler(request, response) {
  if (!requireGet(request, response)) return
  let connection
  try {
    connection = await getDatabasePool().getConnection()
    await connection.query('SELECT ID, Name, Material, Specification FROM Components LIMIT 0')
    await connection.query('SELECT ID, ComponentID, MaintenanceTime, ActionTaken, IssueDescription, ResponsiblePerson FROM MaintenanceRecords LIMIT 0')
    json(response, 200, { status: 'ready' })
  } catch (error) {
    databaseFailure(response, error, { status: 'not_ready' })
  } finally {
    connection?.release()
  }
}

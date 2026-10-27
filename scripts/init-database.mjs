import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import { getDatabaseOptions } from '../server/database.js'
import { componentCatalog } from '../src/data/componentCatalog.js'

let connection
try {
  connection = await mysql.createConnection(getDatabaseOptions())
  const sql = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await connection.query(statement)
  // Refuse to seed incompatible pre-existing tables. No ALTER, DROP or UPDATE is run.
  await connection.query('SELECT ID, Name, Material, Specification FROM Components LIMIT 0')
  await connection.query('SELECT ID, ComponentID, MaintenanceTime, ActionTaken, IssueDescription, ResponsiblePerson FROM MaintenanceRecords LIMIT 0')
  if (process.argv.includes('--seed-catalog')) {
    for (const part of componentCatalog) {
      await connection.execute(
        `INSERT INTO Components (ID, Name, Material, Specification)
         SELECT ?, ?, ?, NULL WHERE NOT EXISTS (SELECT 1 FROM Components WHERE ID = ?)`,
        [Number(part.id), part.componentName, part.material, Number(part.id)])
    }
  }
  const [[counts]] = await connection.query('SELECT COUNT(*) AS component_count FROM Components')
  console.log(JSON.stringify({ initialized: true, component_count: counts.component_count,
    maintenance_records_added: 0, seed_catalog: process.argv.includes('--seed-catalog') }))
} catch (error) {
  console.error('Database initialization failed:', error.code || error.name)
  process.exitCode = 1
} finally {
  await connection?.end()
}

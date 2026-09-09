export function databaseAllocationForInput(input = {}, tenantId = '') {
  const engine = input.databaseEngine === 'mysql' ? 'mariadb' : input.databaseEngine;
  const databaseName = input.databaseName || `t_${String(tenantId).slice(0, 8)}`;
  const configured = {
    mongodb: Boolean(process.env.MONGODB_URL),
    sqlserver: Boolean(process.env.MSSQL_PASSWORD)
  };
  const defaults = {
    postgresql: { host: 'postgres', port: 5432, status: 'READY' },
    mariadb: { host: 'wordpress-db', port: 3306, status: 'READY' },
    mongodb: { host: configured.mongodb ? 'mongodb' : null, port: 27017, status: configured.mongodb ? 'READY' : 'UNVERIFIED' },
    sqlserver: {
      host: process.env.MSSQL_HOST || 'mssql',
      port: Number(process.env.MSSQL_PORT || 1433),
      status: configured.sqlserver ? 'READY' : 'UNVERIFIED'
    }
  };
  const allocation = defaults[engine] || { host: engine || null, port: null, status: 'UNVERIFIED' };
  return {
    engine,
    databaseName,
    ...allocation,
    secretRef: allocation.status === 'READY' ? `db:${tenantId}:${databaseName}` : null
  };
}

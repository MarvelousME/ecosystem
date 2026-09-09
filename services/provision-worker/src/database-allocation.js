export function databaseAllocationForInput(input = {}, tenantId = '') {
  const engine = input.databaseEngine === 'mysql' ? 'mariadb' : input.databaseEngine;
  const databaseName = input.databaseName || `t_${String(tenantId).slice(0, 8)}`;
  const defaults = {
    postgresql: { host: 'postgres', port: 5432, status: 'READY', secretRef: `db:${tenantId}:${databaseName}` },
    mariadb: { host: 'wordpress-db', port: 3306, status: 'READY', secretRef: `db:${tenantId}:${databaseName}` },
    mongodb: {
      host: process.env.MONGODB_URL ? 'mongodb' : null,
      port: 27017,
      status: process.env.MONGODB_URL ? 'READY' : 'UNVERIFIED',
      secretRef: process.env.MONGODB_URL ? `db:${tenantId}:${databaseName}` : null
    },
    sqlserver: {
      host: process.env.MSSQL_HOST || 'mssql',
      port: Number(process.env.MSSQL_PORT || 1433),
      status: process.env.MSSQL_PASSWORD ? 'READY' : 'UNVERIFIED',
      secretRef: process.env.MSSQL_PASSWORD ? `db:${tenantId}:${databaseName}` : null
    }
  };
  const allocation = defaults[engine] || {
    host: engine,
    port: null,
    status: 'UNVERIFIED',
    secretRef: null
  };
  return {
    engine,
    databaseName,
    ...allocation
  };
}

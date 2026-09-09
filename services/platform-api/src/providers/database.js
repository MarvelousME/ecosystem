/**
 * Database engine providers — WordPress stays MySQL/MariaDB only.
 */
import nodeCrypto from 'node:crypto';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import sql from 'mssql';
import { sealSecret } from '../lib/secrets.js';

function cryptoRandom(n) {
  return nodeCrypto.randomBytes(n).toString('base64url');
}

export function sanitizeIdent(raw, { max = 48, prefix = 'b' } = {}) {
  const original = String(raw || '');
  if (/[;'"\\]/.test(original) || original.includes('--') || original.includes('/*') || original.includes('*/')) {
    throw new Error(`unsafe database identifier rejected: ${raw}`);
  }
  const cleaned = original
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, max);
  if (!cleaned || !/^[a-z]/.test(cleaned)) {
    throw new Error(`unsafe database identifier rejected: ${raw}`);
  }
  return `${prefix}_${cleaned}`.slice(0, max);
}

export function assertNotWordpressEngine(appType, engine) {
  const t = String(appType || '').toLowerCase();
  const e = String(engine || '').toLowerCase();
  if ((t === 'wordpress' || t === 'commerce') && !['mysql', 'mariadb'].includes(e)) {
    throw new Error('WordPress applications require MySQL/MariaDB only');
  }
}

export class PostgreSqlProvider {
  id = 'postgresql';
  async health() {
    const url = process.env.DATABASE_URL;
    if (!url) return { ok: false, engine: this.id, reason: 'DATABASE_URL unset' };
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    try {
      await pool.query('SELECT 1');
      return { ok: true, engine: this.id };
    } catch (e) {
      return { ok: false, engine: this.id, reason: e.message };
    } finally {
      await pool.end().catch(() => {});
    }
  }

  async provision({ tenantId, databaseName }) {
    const name = sanitizeIdent(databaseName || `t_${String(tenantId).slice(0, 8)}`, { prefix: 'pg' });
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const exists = await pool.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
      if (!exists.rowCount) {
        await pool.query(`CREATE DATABASE "${name}"`);
      }
      return {
        engine: this.id,
        host: 'postgres',
        port: 5432,
        databaseName: name,
        status: 'READY',
        version: '17'
      };
    } finally {
      await pool.end().catch(() => {});
    }
  }
}

export class MySqlProvider {
  id = 'mariadb';
  async health() {
    const host = process.env.MYSQL_PROVISION_HOST || 'wordpress-db';
    const user = process.env.MYSQL_PROVISION_USER || 'root';
    const password = process.env.MYSQL_PROVISION_PASSWORD || process.env.WP_DB_PASSWORD || '';
    try {
      const conn = await mysql.createConnection({
        host,
        user,
        password,
        port: Number(process.env.MYSQL_PROVISION_PORT || 3306)
      });
      await conn.query('SELECT 1');
      await conn.end();
      return { ok: true, engine: this.id };
    } catch (e) {
      return { ok: false, engine: this.id, reason: e.message };
    }
  }

  async provision({ tenantId, databaseName }) {
    const name = sanitizeIdent(databaseName || `t_${String(tenantId).slice(0, 8)}`, { prefix: 'my' });
    const host = process.env.MYSQL_PROVISION_HOST || 'wordpress-db';
    const user = process.env.MYSQL_PROVISION_USER || 'root';
    const password = process.env.MYSQL_PROVISION_PASSWORD || process.env.WP_DB_PASSWORD || '';
    const conn = await mysql.createConnection({
      host,
      user,
      password,
      port: Number(process.env.MYSQL_PROVISION_PORT || 3306)
    });
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
      return {
        engine: this.id,
        host,
        port: 3306,
        databaseName: name,
        status: 'READY',
        version: '11'
      };
    } finally {
      await conn.end().catch(() => {});
    }
  }
}

export class MongoDbProvider {
  id = 'mongodb';
  adminUri() {
    return process.env.MONGODB_URL || process.env.MONGO_URL || '';
  }

  async health() {
    const uri = this.adminUri();
    if (!uri) return { ok: false, engine: this.id, reason: 'MONGODB_URL unset', status: 'UNVERIFIED' };
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      return { ok: true, engine: this.id, status: 'READY' };
    } catch (e) {
      return { ok: false, engine: this.id, reason: e.message, status: 'UNVERIFIED' };
    } finally {
      await client.close().catch(() => {});
    }
  }

  async provision({ tenantId, applicationId, databaseName }) {
    const uri = this.adminUri();
    const name = sanitizeIdent(databaseName || `t_${String(tenantId).slice(0, 8)}`, { prefix: 'mg' });
    if (!uri) {
      return {
        engine: this.id,
        host: null,
        port: 27017,
        databaseName: name,
        status: 'UNVERIFIED',
        version: null,
        warning: 'MONGODB_URL not configured'
      };
    }
    const appUser = sanitizeIdent(`u_${String(tenantId).slice(0, 8)}`, { prefix: 'mu', max: 32 });
    const appPass = cryptoRandom(24);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.connect();
      const db = client.db(name);
      await db.collection('_bridge_meta').updateOne(
        { _id: 'provision' },
        { $set: { tenantId, applicationId, at: new Date().toISOString() } },
        { upsert: true }
      );
      try {
        await db.command({
          createUser: appUser,
          pwd: appPass,
          roles: [{ role: 'readWrite', db: name }]
        });
      } catch (e) {
        if (!/already exists/i.test(String(e.message))) throw e;
      }
      const sealed = await sealSecret(`${appUser}:${appPass}`, {
        tenantId,
        appId: applicationId,
        secretName: `mongo:${name}`,
        purpose: 'bridge-secret'
      });
      return {
        engine: this.id,
        host: new URL(uri).hostname,
        port: Number(new URL(uri).port || 27017),
        databaseName: name,
        status: 'READY',
        version: '7',
        secretPayload: sealed,
        secretRef: `mongo:${tenantId}:${name}`
      };
    } finally {
      await client.close().catch(() => {});
    }
  }
}

export class SqlServerProvider {
  id = 'sqlserver';
  config() {
    return {
      server: process.env.MSSQL_HOST || 'mssql',
      port: Number(process.env.MSSQL_PORT || 1433),
      user: process.env.MSSQL_USER || 'sa',
      password: process.env.MSSQL_PASSWORD || '',
      options: {
        encrypt: process.env.MSSQL_ENCRYPT === '1',
        trustServerCertificate: process.env.MSSQL_TRUST_CERT !== '0'
      },
      connectionTimeout: 5000,
      requestTimeout: 15000
    };
  }

  async health() {
    if (!process.env.MSSQL_PASSWORD) {
      return { ok: false, engine: this.id, reason: 'MSSQL_PASSWORD unset', status: 'UNVERIFIED' };
    }
    try {
      const pool = await sql.connect(this.config());
      await pool.request().query('SELECT 1 AS ok');
      await pool.close();
      return { ok: true, engine: this.id, status: 'READY' };
    } catch (e) {
      return { ok: false, engine: this.id, reason: e.message, status: 'UNVERIFIED' };
    }
  }

  async provision({ tenantId, applicationId, databaseName }) {
    const name = sanitizeIdent(databaseName || `t_${String(tenantId).slice(0, 8)}`, { prefix: 'ss' });
    if (!process.env.MSSQL_PASSWORD) {
      return {
        engine: this.id,
        host: process.env.MSSQL_HOST || 'mssql',
        port: 1433,
        databaseName: name,
        status: 'UNVERIFIED',
        warning: 'MSSQL not configured'
      };
    }
    const login = sanitizeIdent(`l_${String(tenantId).slice(0, 8)}`, { prefix: 'sl', max: 32 });
    const pass = `${cryptoRandom(18)}Aa1!`;
    const pool = await sql.connect(this.config());
    try {
      const exists = await pool
        .request()
        .input('name', sql.NVarChar, name)
        .query('SELECT name FROM sys.databases WHERE name = @name');
      if (!exists.recordset.length) {
        // name already sanitized — bracket-quoted identifier only
        await pool.request().query(`CREATE DATABASE [${name}]`);
      }
      try {
        await pool
          .request()
          .input('login', sql.NVarChar, login)
          .input('pass', sql.NVarChar, pass)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @login)
            BEGIN
              DECLARE @sql nvarchar(max) = N'CREATE LOGIN [' + REPLACE(@login, ']', ']]') + N'] WITH PASSWORD = ' + QUOTENAME(@pass, '''');
              EXEC(@sql);
            END
          `);
      } catch (e) {
        if (!/already exists/i.test(String(e.message))) throw e;
      }
      await pool.request().query(`
        USE [${name}];
        IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'${login}')
          CREATE USER [${login}] FOR LOGIN [${login}];
        ALTER ROLE db_datareader ADD MEMBER [${login}];
        ALTER ROLE db_datawriter ADD MEMBER [${login}];
      `);
      const sealed = await sealSecret(`${login}:${pass}`, {
        tenantId,
        appId: applicationId,
        secretName: `mssql:${name}`,
        purpose: 'bridge-secret'
      });
      return {
        engine: this.id,
        host: process.env.MSSQL_HOST || 'mssql',
        port: Number(process.env.MSSQL_PORT || 1433),
        databaseName: name,
        status: 'READY',
        version: '2022',
        secretPayload: sealed,
        secretRef: `mssql:${tenantId}:${name}`
      };
    } finally {
      await pool.close().catch(() => {});
    }
  }
}

export function getDatabaseProvider(engine) {
  const e = String(engine || '').toLowerCase();
  if (e === 'postgresql' || e === 'postgres') return new PostgreSqlProvider();
  if (e === 'mysql' || e === 'mariadb') return new MySqlProvider();
  if (e === 'mongodb' || e === 'mongo') return new MongoDbProvider();
  if (e === 'sqlserver' || e === 'mssql') return new SqlServerProvider();
  throw new Error(`unsupported engine ${engine}`);
}

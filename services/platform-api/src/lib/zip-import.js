import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail } from './kernel.js';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * Malware scanner adapter — fail-closed.
 * Lab: rejects EICAR string and non-zip magic. Optional BRIDGE_MALWARE_SCAN_URL webhook.
 */
export async function scanBuffer(buf, { filename = 'upload.bin' } = {}) {
  const text = buf.toString('utf8');
  if (text.includes(EICAR) || text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
    return { clean: false, engine: 'lab-eicar', detail: 'EICAR test signature detected' };
  }

  const magic = buf.subarray(0, 4).toString('hex');
  const isZip = magic === '504b0304' || magic === '504b0506' || magic === '504b0708';
  if (!isZip) {
    return { clean: false, engine: 'lab-magic', detail: `not a ZIP (magic=${magic})` };
  }

  const scanUrl = process.env.BRIDGE_MALWARE_SCAN_URL;
  if (scanUrl) {
    try {
      const r = await fetch(scanUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-filename': filename },
        body: buf
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.clean === false) {
        return { clean: false, engine: 'external', detail: j.detail || `scanner HTTP ${r.status}` };
      }
      return { clean: true, engine: 'external', detail: j.detail || 'ok' };
    } catch (e) {
      return { clean: false, engine: 'external', detail: `scanner unreachable: ${e.message}` };
    }
  }

  // Lab default: ZIP magic OK and no EICAR → clean (still quarantined until promote)
  return { clean: true, engine: 'lab-magic', detail: 'zip magic ok; no external scanner configured' };
}

export function quarantineRoot() {
  return process.env.BRIDGE_QUARANTINE_DIR || path.join(process.cwd(), '.quarantine');
}

/**
 * Quarantine pipeline: write bytes → scan → record row.
 * Does not promote into runtime until status=released.
 */
export async function ingestZipImport(pool, ctx, { filename, contentBase64, appId = null }) {
  if (!contentBase64) throw fail('VALIDATION', 'contentBase64 required');
  let buf;
  try {
    buf = Buffer.from(contentBase64, 'base64');
  } catch {
    throw fail('VALIDATION', 'invalid base64');
  }
  if (!buf.length) throw fail('VALIDATION', 'empty payload');
  if (buf.length > 25 * 1024 * 1024) throw fail('VALIDATION', 'ZIP exceeds 25MB limit', 413);

  const id = crypto.randomUUID();
  const safeName = String(filename || 'site.zip').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const dir = path.join(quarantineRoot(), String(ctx.tenantId || 'unknown'));
  await fs.mkdir(dir, { recursive: true });
  const storedPath = path.join(dir, `${id}-${safeName}`);
  await fs.writeFile(storedPath, buf);

  const scan = await scanBuffer(buf, { filename: safeName });
  const status = scan.clean ? 'quarantined' : 'rejected';

  const r = await pool.query(
    `INSERT INTO zip_imports(id,tenant_id,application_id,filename,stored_path,status,scan_engine,scan_detail,bytes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, ctx.tenantId, appId, safeName, storedPath, status, scan.engine, scan.detail, buf.length]
  );

  if (!scan.clean) {
    return { import: r.rows[0], released: false, rejected: true };
  }
  return { import: r.rows[0], released: false, rejected: false, message: 'Held in quarantine; POST /api/imports/:id/release to promote' };
}

export async function releaseZipImport(pool, ctx, importId) {
  const row = (await pool.query(
    `SELECT * FROM zip_imports WHERE id=$1 AND tenant_id=$2`,
    [importId, ctx.tenantId]
  )).rows[0];
  if (!row) throw fail('NOT_FOUND', 'import not found', 404);
  if (row.status === 'rejected') throw fail('CONFLICT', 'rejected imports cannot be released', 409);
  if (row.status === 'released') return row;

  const updated = (await pool.query(
    `UPDATE zip_imports SET status='released', released_at=now() WHERE id=$1 RETURNING *`,
    [importId]
  )).rows[0];
  return updated;
}

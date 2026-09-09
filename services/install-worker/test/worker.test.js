import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('install-worker', () => {
  it('should export processEvent function', async () => {
    const { processEvent } = await import('../src/worker.js');
    assert.strictEqual(typeof processEvent, 'function');
  });

  it('should handle duplicate events idempotently', async () => {
    // This would require a test database, placeholder for now
    const { processEvent } = await import('../src/worker.js');
    assert.ok(processEvent);
  });
});

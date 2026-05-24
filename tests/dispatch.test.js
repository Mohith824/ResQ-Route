const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const { pool } = require('../db');

// Helper to reset the database to a fresh seeded state before each test
async function resetDatabase() {
  const connection = await pool.getConnection();
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
    const statements = schemaSql
      .split(/;\s*[\r\n]/)
      .map(s => s.trim())
      .filter(s => {
        if (!s) return false;
        const lines = s.split('\n').map(l => l.trim());
        return lines.filter(l => l && !l.startsWith('--')).length > 0;
      });

    for (const stmt of statements) {
      if (stmt) await connection.query(stmt);
    }
  } finally {
    connection.release();
  }
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  // Close database pool to allow Jest to exit cleanly
  await pool.end();
});

describe('ResQ-Route API Health Check', () => {
  it('should return 200 OK for /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});

describe('POST /api/dispatch - ACID Transactions', () => {
  it('should successfully dispatch supplies and reduce inventory', async () => {
    // Before dispatch: item 1 (Bottled Drinking Water) has quantity 1500
    // Dispatch 200 cases to zone 1 (Downtown Flooding)
    const res = await request(app)
      .post('/api/dispatch')
      .send({ item_id: 1, zone_id: 1, quantity: 200 });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('allocation successfully dispatched');
    expect(res.body.data.remaining_quantity).toBe(1300);

    // Verify database updates
    const [invRows] = await pool.query('SELECT quantity FROM supplies_inventory WHERE item_id = 1');
    expect(invRows[0].quantity).toBe(1300);

    const [logRows] = await pool.query('SELECT * FROM dispatch_logs WHERE dispatch_id = ?', [res.body.data.dispatch_id]);
    expect(logRows.length).toBe(1);
    expect(logRows[0].quantity_sent).toBe(200);
  });

  it('should rollback transaction and return 400 if stock is insufficient', async () => {
    // Item 1 has 1500 cases. Requesting 1600.
    const res = await request(app)
      .post('/api/dispatch')
      .send({ item_id: 1, zone_id: 1, quantity: 1600 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Insufficient inventory stock');

    // Verify transaction rollback (inventory remains unchanged, no log inserted)
    const [invRows] = await pool.query('SELECT quantity FROM supplies_inventory WHERE item_id = 1');
    expect(invRows[0].quantity).toBe(1500);

    const [logRows] = await pool.query('SELECT * FROM dispatch_logs WHERE item_id = 1 AND quantity_sent = 1600');
    expect(logRows.length).toBe(0);
  });

  it('should return 404 if item does not exist in supplies_inventory', async () => {
    const res = await request(app)
      .post('/api/dispatch')
      .send({ item_id: 999, zone_id: 1, quantity: 50 });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found in inventory');
  });

  it('should rollback and return 404 if disaster zone does not exist (FK check failure)', async () => {
    // Item 1 exists, but zone 999 does not.
    const res = await request(app)
      .post('/api/dispatch')
      .send({ item_id: 1, zone_id: 999, quantity: 50 });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Disaster zone with ID 999 does not exist');

    // Verify inventory rollback (inventory should not have changed)
    const [invRows] = await pool.query('SELECT quantity FROM supplies_inventory WHERE item_id = 1');
    expect(invRows[0].quantity).toBe(1500);
  });

  it('should handle concurrent requests and prevent double allocations (Pessimistic Locking test)', async () => {
    // Item 1 has 1500 cases.
    // Trigger two requests concurrently:
    // Request A allocates 1000, Request B allocates 800 (Total: 1800 > 1500).
    // The database transaction and SELECT FOR UPDATE should queue the requests,
    // allowing one to succeed and the other to fail due to insufficient inventory.
    const reqA = request(app).post('/api/dispatch').send({ item_id: 1, zone_id: 1, quantity: 1000 });
    const reqB = request(app).post('/api/dispatch').send({ item_id: 1, zone_id: 1, quantity: 800 });

    const [resA, resB] = await Promise.all([reqA, reqB]);

    const successRes = [resA, resB].find(r => r.status === 200);
    const failureRes = [resA, resB].find(r => r.status === 400);

    expect(successRes).toBeDefined();
    expect(failureRes).toBeDefined();
    expect(failureRes.body.error).toContain('Insufficient inventory stock');

    // Verify database final state matches the successful transaction only
    const [invRows] = await pool.query('SELECT quantity FROM supplies_inventory WHERE item_id = 1');
    expect(invRows[0].quantity).toBe(500); // 1500 - 1000 = 500
  });
});

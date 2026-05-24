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
    const statements = [];
    let currentDelimiter = ';';
    let currentStatement = '';

    const lines = schemaSql.split(/\r?\n/);
    for (let line of lines) {
      let cleanedLine = line;
      const commentIdx = line.indexOf('--');
      if (commentIdx !== -1) {
        cleanedLine = line.substring(0, commentIdx);
      }
      const trimmedCleaned = cleanedLine.trim();

      if (!trimmedCleaned) {
        continue;
      }

      if (trimmedCleaned.toUpperCase().startsWith('DELIMITER')) {
        const parts = trimmedCleaned.split(/\s+/);
        if (parts.length > 1) {
          currentDelimiter = parts[1];
        }
        continue;
      }

      currentStatement += (currentStatement ? '\n' : '') + cleanedLine;

      if (trimmedCleaned.endsWith(currentDelimiter)) {
        let sql = currentStatement.trim();
        if (sql.endsWith(currentDelimiter)) {
          sql = sql.substring(0, sql.length - currentDelimiter.length).trim();
        }
        if (sql) {
          statements.push(sql);
        }
        currentStatement = '';
      }
    }

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

  it('should automatically set zone status to CRITICAL SYSTEM ALERT when inventory falls below minimum_threshold', async () => {
    // Before dispatch: item 5 (Heavy-Duty Diesel Generators) quantity = 20, threshold = 5
    // Dispatch 16 units to zone 4 (Pine Forest).
    // Remaining quantity: 4. This is less than threshold 5.
    // The AFTER UPDATE trigger on supplies_inventory should update zone 4 status to 'CRITICAL SYSTEM ALERT'.

    // Verify initial state of zone 4 is NOT 'CRITICAL SYSTEM ALERT'
    const [zoneInitial] = await pool.query('SELECT status FROM disaster_zones WHERE zone_id = 4');
    expect(zoneInitial[0].status).not.toBe('CRITICAL SYSTEM ALERT');

    const res = await request(app)
      .post('/api/dispatch')
      .send({ item_id: 5, zone_id: 4, quantity: 16 });

    expect(res.status).toBe(200);
    expect(res.body.data.remaining_quantity).toBe(4);

    // Verify trigger automatically updated the status of disaster zone 4
    const [zoneFinal] = await pool.query('SELECT status FROM disaster_zones WHERE zone_id = 4');
    expect(zoneFinal[0].status).toBe('CRITICAL SYSTEM ALERT');
  });
});

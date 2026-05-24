const { pool } = require('./db');

async function checkDatabase() {
  try {
    console.log('=== RESQ-ROUTE LIVE DATABASE STATE ===\n');

    // 1. Disaster Zones
    const [zones] = await pool.query('SELECT * FROM disaster_zones');
    console.log('--- disaster_zones ---');
    console.table(zones);

    // 2. Supplies Inventory
    const [inventory] = await pool.query(`
      SELECT si.item_id, si.item_name, si.quantity, si.minimum_threshold, rc.camp_name 
      FROM supplies_inventory si
      JOIN relief_camps rc ON si.camp_id = rc.camp_id
    `);
    console.log('\n--- supplies_inventory (with Relief Camp join) ---');
    console.table(inventory);

    // 3. Dispatch Logs
    const [logs] = await pool.query('SELECT * FROM dispatch_logs ORDER BY dispatch_timestamp DESC LIMIT 10');
    console.log('\n--- dispatch_logs (Latest 10 logs) ---');
    console.table(logs);

  } catch (error) {
    console.error('Error querying database:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();

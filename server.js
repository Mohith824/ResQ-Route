const express = require('express');
const { pool } = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return res.status(200).json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    return res.status(500).json({ status: 'Error', database: error.message });
  }
});

// POST /api/dispatch - processes an emergency allocation with ACID transaction
app.post('/api/dispatch', async (req, res) => {
  const { item_id, zone_id, quantity } = req.body;

  // 1. Input Validation
  if (item_id === undefined || zone_id === undefined || quantity === undefined) {
    return res.status(400).json({
      error: 'Missing required parameters: item_id, zone_id, and quantity are required.'
    });
  }

  const itemIdParsed = Number(item_id);
  const zoneIdParsed = Number(zone_id);
  const quantityParsed = Number(quantity);

  if (isNaN(itemIdParsed) || itemIdParsed <= 0 || !Number.isInteger(itemIdParsed)) {
    return res.status(400).json({ error: 'Invalid item_id. Must be a positive integer.' });
  }

  if (isNaN(zoneIdParsed) || zoneIdParsed <= 0 || !Number.isInteger(zoneIdParsed)) {
    return res.status(400).json({ error: 'Invalid zone_id. Must be a positive integer.' });
  }

  if (isNaN(quantityParsed) || quantityParsed <= 0 || !Number.isInteger(quantityParsed)) {
    return res.status(400).json({ error: 'Invalid quantity. Must be a positive integer greater than 0.' });
  }

  // Get a connection from pool for transaction consistency
  const connection = await pool.getConnection();

  try {
    // START TRANSACTION
    await connection.beginTransaction();

    // 2. Pessimistic locking (SELECT FOR UPDATE) to prevent race conditions and dirty reads
    const [inventoryRows] = await connection.query(
      'SELECT quantity, item_name FROM supplies_inventory WHERE item_id = ? FOR UPDATE',
      [itemIdParsed]
    );

    if (inventoryRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Supply item with ID ${itemIdParsed} not found in inventory.` });
    }

    const currentQuantity = inventoryRows[0].quantity;
    const itemName = inventoryRows[0].item_name;

    // 3. Inventory sufficiency check
    if (currentQuantity < quantityParsed) {
      await connection.rollback();
      return res.status(400).json({
        error: 'Insufficient inventory stock.',
        details: {
          item_id: itemIdParsed,
          item_name: itemName,
          available_quantity: currentQuantity,
          requested_quantity: quantityParsed
        }
      });
    }

    // 4. INSERT INTO dispatch_logs
    const [insertResult] = await connection.query(
      'INSERT INTO dispatch_logs (item_id, zone_id, quantity_sent) VALUES (?, ?, ?)',
      [itemIdParsed, zoneIdParsed, quantityParsed]
    );

    // 5. UPDATE supplies_inventory
    await connection.query(
      'UPDATE supplies_inventory SET quantity = quantity - ? WHERE item_id = ?',
      [quantityParsed, itemIdParsed]
    );

    // COMMIT
    await connection.commit();

    return res.status(200).json({
      message: 'Emergency allocation successfully dispatched.',
      data: {
        dispatch_id: insertResult.insertId,
        item_id: itemIdParsed,
        item_name: itemName,
        zone_id: zoneIdParsed,
        quantity_sent: quantityParsed,
        remaining_quantity: currentQuantity - quantityParsed
      }
    });

  } catch (error) {
    // ROLLBACK on any errors/exceptions
    await connection.rollback();

    // Handle database constraint and foreign key validation failures cleanly
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      if (error.sqlMessage && error.sqlMessage.includes('fk_dispatch_zone')) {
        return res.status(404).json({
          error: `Disaster zone with ID ${zoneIdParsed} does not exist. Transaction rolled back.`
        });
      }
      if (error.sqlMessage && error.sqlMessage.includes('fk_dispatch_item')) {
        return res.status(404).json({
          error: `Supply item with ID ${itemIdParsed} does not exist. Transaction rolled back.`
        });
      }
    }

    console.error('Transaction error:', error);
    return res.status(500).json({
      error: 'An internal error occurred during the dispatch transaction.',
      details: error.message
    });
  } finally {
    // Release connection back to pool
    connection.release();
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`ResQ-Route backend API listening on port ${PORT}`);
  });
}

module.exports = app;

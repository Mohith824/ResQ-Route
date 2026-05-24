const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'resq_route',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper function to test connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to the database.');
    connection.release();
    return true;
  } catch (error) {
    console.error('Error connecting to the database:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection
};

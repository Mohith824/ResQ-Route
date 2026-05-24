const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
  console.log('Connecting to MySQL host...');
  
  // Connect without a database initially because it might not exist yet
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '2005'
  });

  try {
    console.log('Reading schema.sql...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Split SQL by semicolon followed by newline to get individual statements
    // We filter out comments and empty statements
    const statements = schemaSql
      .split(/;\s*[\r\n]/)
      .map(statement => statement.trim())
      .filter(statement => {
        // Exclude empty statements and comment-only lines
        if (!statement) return false;
        const lines = statement.split('\n').map(l => l.trim());
        const contentLines = lines.filter(l => l && !l.startsWith('--'));
        return contentLines.length > 0;
      });

    console.log(`Executing ${statements.length} SQL statements...`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Skip delimiter lines or empty statements
      if (!stmt) continue;
      
      try {
        await connection.query(stmt);
      } catch (err) {
        console.error(`Error executing statement ${i + 1}:`);
        console.error(stmt);
        throw err;
      }
    }

    console.log('Database initialization and seeding completed successfully!');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

initDatabase();

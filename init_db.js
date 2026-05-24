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

    // Parse SQL file line-by-line supporting DELIMITER statement changes
    const statements = [];
    let currentDelimiter = ';';
    let currentStatement = '';

    const lines = schemaSql.split(/\r?\n/);
    for (let line of lines) {
      // Strip comments (e.g. lines starting with -- or inline comments)
      let cleanedLine = line;
      const commentIdx = line.indexOf('--');
      if (commentIdx !== -1) {
        cleanedLine = line.substring(0, commentIdx);
      }
      const trimmedCleaned = cleanedLine.trim();

      if (!trimmedCleaned) {
        continue;
      }

      // Check if delimiter is being changed
      if (trimmedCleaned.toUpperCase().startsWith('DELIMITER')) {
        const parts = trimmedCleaned.split(/\s+/);
        if (parts.length > 1) {
          currentDelimiter = parts[1];
        }
        continue;
      }

      // Append line to current statement
      currentStatement += (currentStatement ? '\n' : '') + cleanedLine;

      // Check if statement ends with the active delimiter
      if (trimmedCleaned.endsWith(currentDelimiter)) {
        // Strip delimiter before executing
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

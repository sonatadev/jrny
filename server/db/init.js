const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await pool.query(schema);
      console.log('✅ Database inizializzato');
      return;
    } catch (err) {
      if (i < retries - 1) {
        console.log(`⏳ DB non pronto, retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

module.exports = { pool, initDb };

const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://neondb_owner:npg_CAxZskSV30jq@ep-wild-bread-a7jqyita.ap-southeast-2.aws.neon.tech/clawdeploy?sslmode=require';
const sql = fs.readFileSync('./schema.sql', 'utf8');

async function migrate() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to Neon database');
    
    await client.query(sql);
    console.log('✅ Schema created successfully');
    
    // Verify tables
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('\n📊 Created tables:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();

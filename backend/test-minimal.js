import db from './db.js';

async function testMinimal() {
  try {
    console.log('Testing minimal insert...');
    await db.executeQuery("INSERT INTO dbo.Buses (Username) VALUES (@u)", { u: 'test-user-999' });
    console.log('✅ Minimal insert succeeded!');
    await db.executeQuery("DELETE FROM dbo.Buses WHERE Username = 'test-user-999'");
  } catch (err) {
    console.error('❌ Minimal insert failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}
testMinimal();

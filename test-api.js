import http from 'http';

const testAPI = async (endpoint) => {
  const opts = {
    hostname: 'localhost',
    port: 4010,
    path: endpoint,
    method: 'GET'
  };

  return new Promise((resolve) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`\n📍 Testing ${endpoint}`);
          console.log(`✅ Response received:`);
          console.log(`   Total count: ${result.count || result.onlineCount || 'N/A'}`);
          const totalBuses = Array.isArray(result.buses) ? result.buses.length : 0;
          const onlineBuses = Array.isArray(result.buses) ? result.buses.filter(b => b.isOnline).length : 0;
          console.log(`   Total buses returned: ${totalBuses}`);
          console.log(`   Online buses: ${onlineBuses}`);
        } catch (e) {
          console.error('❌ Failed to parse response:', e.message);
          console.error('Raw data:', data.substring(0, 200));
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`❌ Request error on ${endpoint}:`, e.message);
      resolve();
    });

    req.end();
  });
};

// Test both endpoints
await testAPI('/api/buses');
await testAPI('/api/buses/live');

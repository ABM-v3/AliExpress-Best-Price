// Test your AliExpress API credentials independently
const axios = require('axios');

async function testAuth() {
  try {
    const response = await axios.post('https://api.alibaba.com/token', {
      client_id: process.env.ALI_APP_KEY,
      client_secret: process.env.ALI_APP_SECRET,
      grant_type: 'client_credentials'
    });
    console.log('API Token:', response.data.access_token);
  } catch (e) {
    console.error('Auth Failed:', e.response.data);
  }
}

testAuth();

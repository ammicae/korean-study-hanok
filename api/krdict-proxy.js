import https from 'https';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });

// Helper function to make the request with timeout
function fetchWithTimeout(url, options, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

export default async function handler(req, res) {
  const { q, test } = req.query;

  // Simple test endpoint to confirm the function is alive
  if (test !== undefined) {
    return res.status(200).json({ message: 'Proxy is working', timestamp: Date.now() });
  }

  if (!q) {
    return res.status(400).json({ error: 'Missing q parameter' });
  }

  const apiKey = '09039EB86949159AD9DFFB98AD411BBD';
  const decoded = decodeURIComponent(q);
  const encoded = encodeURIComponent(decoded);
  const url = `https://krdict.korean.go.kr/api/search?key=${apiKey}&type_search=search&part=word&type=json&q=${encoded}`;

  const requestUrl = new URL(url);
  const options = {
    hostname: requestUrl.hostname,
    path: requestUrl.pathname + requestUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    }
  };

  try {
    const response = await fetchWithTimeout(requestUrl, options, 8000);
    if (response.status !== 200) {
      console.error(`KRDict returned HTTP ${response.status}`);
      return res.status(502).json({ error: `KRDict returned HTTP ${response.status}` });
    }
    const parsed = parser.parse(response.data);
    if (parsed && parsed.channel) {
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(JSON.stringify(parsed.channel));
    } else {
      res.status(500).json({ error: 'Unexpected XML structure' });
    }
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch from KRDict', details: err.message });
  }
}
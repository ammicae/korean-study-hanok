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

// Recursively replace Korean definition with English if present
function replaceDefinitions(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => replaceDefinitions(item));
  }
  const newObj = {};
  for (const key in obj) {
    if (key === 'sense') {
      // sense can be an object or array
      if (Array.isArray(obj.sense)) {
        newObj.sense = obj.sense.map(s => {
          if (s.definition_en) {
            return { ...s, definition: s.definition_en };
          }
          return s;
        });
      } else if (obj.sense && typeof obj.sense === 'object') {
        if (obj.sense.definition_en) {
          newObj.sense = { ...obj.sense, definition: obj.sense.definition_en };
        } else {
          newObj.sense = obj.sense;
        }
      } else {
        newObj.sense = obj.sense;
      }
    } else {
      newObj[key] = replaceDefinitions(obj[key]);
    }
  }
  return newObj;
}

export default async function handler(req, res) {
  const { q, test } = req.query;

  // Simple test endpoint
  if (test !== undefined) {
    return res.status(200).json({ message: 'Proxy is working', timestamp: Date.now() });
  }

  if (!q) {
    return res.status(400).json({ error: 'Missing q parameter' });
  }

  const apiKey = '09039EB86949159AD9DFFB98AD411BBD';
  const decoded = decodeURIComponent(q);
  const encoded = encodeURIComponent(decoded);
  // Add lang=1 to request English definitions
  const url = `https://krdict.korean.go.kr/api/search?key=${apiKey}&type_search=search&part=word&type=json&q=${encoded}&lang=1`;

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
      // Replace Korean definitions with English where available
      const modifiedChannel = replaceDefinitions(parsed.channel);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(JSON.stringify(modifiedChannel));
    } else {
      res.status(500).json({ error: 'Unexpected XML structure' });
    }
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch from KRDict', details: err.message });
  }
}
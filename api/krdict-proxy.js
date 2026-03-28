import https from 'https';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });

// Helper: fetch with timeout
function fetchWithTimeout(url, options, timeout = 8000) {
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

// Translate text using LibreTranslate public API (no key required!)
async function translateToEnglish(text) {
  if (!text) return text;
  
  const postData = JSON.stringify({
    q: text,
    source: 'ko',
    target: 'en',
    format: 'text'
  });
  
  const options = {
    hostname: 'libretranslate.com',
    path: '/translate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.translatedText || text);
        } catch (e) {
          console.error('LibreTranslate parse error:', e.message);
          resolve(text);
        }
      });
    });
    req.on('error', (e) => {
      console.error('LibreTranslate request error:', e.message);
      resolve(text);
    });
    req.write(postData);
    req.end();
  });
}

// Recursively translate definitions
async function translateDefinitions(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => translateDefinitions(item)));
  }
  
  const newObj = {};
  for (const key in obj) {
    if (key === 'sense') {
      if (Array.isArray(obj.sense)) {
        newObj.sense = await Promise.all(obj.sense.map(async s => {
          if (s.definition && s.definition.trim()) {
            const translated = await translateToEnglish(s.definition);
            return { ...s, definition: translated };
          }
          return s;
        }));
      } else if (obj.sense && typeof obj.sense === 'object') {
        if (obj.sense.definition && obj.sense.definition.trim()) {
          const translated = await translateToEnglish(obj.sense.definition);
          newObj.sense = { ...obj.sense, definition: translated };
        } else {
          newObj.sense = obj.sense;
        }
      } else {
        newObj.sense = obj.sense;
      }
    } else {
      newObj[key] = await translateDefinitions(obj[key]);
    }
  }
  return newObj;
}

export default async function handler(req, res) {
  const { q, test } = req.query;
  
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/xml, text/xml, */*'
    }
  };
  
  try {
    const response = await fetchWithTimeout(requestUrl, options, 8000);
    if (response.status !== 200) {
      return res.status(502).json({ error: `KRDict returned HTTP ${response.status}` });
    }
    
    const parsed = parser.parse(response.data);
    if (!parsed || !parsed.channel) {
      return res.status(500).json({ error: 'Unexpected XML structure' });
    }
    
    // Translate using LibreTranslate (no API key needed)
    const translatedChannel = await translateDefinitions(parsed.channel);
    
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(translatedChannel));
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch from KRDict', details: err.message });
  }
}
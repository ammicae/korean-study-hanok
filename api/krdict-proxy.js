import https from 'https';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });

export default async function handler(req, res) {
  const q = req.query.q;
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

  return new Promise((resolve) => {
    const request = https.get(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = parser.parse(data);
          if (parsed && parsed.channel) {
            res.setHeader('Content-Type', 'application/json');
            res.status(200).send(JSON.stringify(parsed.channel));
          } else {
            res.status(500).json({ error: 'Unexpected XML structure' });
          }
        } catch (err) {
          console.error('XML parsing error:', err);
          res.status(500).json({ error: 'Failed to parse XML', details: err.message });
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.status(502).json({ error: 'Failed to fetch from KRDict', details: err.message });
      resolve();
    });

    request.end();
  });
}
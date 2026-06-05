const https = require('https');

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'OpenAI API key niet geconfigureerd' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { prompt, size, imageBase64, imageType } = body;

    if (!prompt) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Prompt is verplicht' })
      };
    }

    let resultData;

    if (imageBase64) {
      // Foto als input meegeven — gebruik /v1/images/edits endpoint
      // Bouw multipart/form-data handmatig
      const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
      const mimeType = imageType || 'image/jpeg';

      // Zet base64 om naar buffer
      const imageBuffer = Buffer.from(imageBase64, 'base64');

      // Bouw multipart body
      const parts = [];

      // model
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1`
      );

      // prompt
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}`
      );

      // size
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${size || '1024x1024'}`
      );

      // quality
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\nmedium`
      );

      // n
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="n"\r\n\r\n1`
      );

      // image file
      const imageHeader = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="product.png"\r\nContent-Type: image/png\r\n\r\n`;

      const textEncoder = parts.join('\r\n') + '\r\n';
      const textBuffer = Buffer.from(textEncoder, 'utf8');
      const imageHeaderBuffer = Buffer.from(imageHeader, 'utf8');
      const closingBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

      const postBuffer = Buffer.concat([textBuffer, imageHeaderBuffer, imageBuffer, closingBuffer]);

      resultData = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.openai.com',
          port: 443,
          path: '/v1/images/edits',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Authorization': 'Bearer ' + OPENAI_API_KEY,
            'Content-Length': postBuffer.length
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(postBuffer);
        req.end();
      });

    } else {
      // Geen input foto — gewoon genereren
      const postData = JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: size || '1024x1024',
        quality: 'medium'
      });

      resultData = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.openai.com',
          port: 443,
          path: '/v1/images/generations',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + OPENAI_API_KEY,
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    }

    const data = JSON.parse(resultData.body);

    if (resultData.status !== 200) {
      return {
        statusCode: resultData.status,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: data?.error?.message || 'OpenAI fout ' + resultData.status })
      };
    }

    const b64 = data.data[0].b64_json;
    const dataUrl = 'data:image/png;base64,' + b64;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ url: dataUrl })
    };

  } catch(err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { text } = JSON.parse(event.body || '{}');
    if (!text) return { statusCode: 400, body: 'Missing text' };

    const apiKey = process.env.FISH_API_KEY;
    const voiceId = process.env.FISH_VOICE_ID || '';
    if (!apiKey) {
      return { statusCode: 500, body: 'FISH_API_KEY not set in Netlify environment variables' };
    }

    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        model: 's2.1-pro-free'
      },
      body: JSON.stringify({
        text,
        format: 'mp3',
        reference_id: voiceId || undefined
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: res.status, body: errText };
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
      body: base64,
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 500, body: 'Server error: ' + e.message };
  }
};

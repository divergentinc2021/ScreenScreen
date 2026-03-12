interface Env {
  AI: any
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    if (url.pathname === '/api/transcribe' && request.method === 'POST') {
      return handleTranscribe(request, env)
    }

    if (url.pathname === '/api/summarize' && request.method === 'POST') {
      return handleSummarize(request, env)
    }

    if (url.pathname === '/api/generate-minutes' && request.method === 'POST') {
      return handleGenerateMinutes(request, env)
    }

    return new Response(JSON.stringify({
      status: 'ok',
      endpoints: ['/api/transcribe', '/api/summarize', '/api/generate-minutes']
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  },
}

// ── Transcribe: accepts audio binary, returns transcript ──

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  try {
    const audioData = await request.arrayBuffer()

    if (!audioData || audioData.byteLength < 100) {
      return new Response(JSON.stringify({ error: 'No audio data received' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Workers AI Whisper — accepts raw audio bytes
    const result = await env.AI.run('@cf/openai/whisper', {
      audio: [...new Uint8Array(audioData)],
    })

    // Result shape: { text: string, vtt?: string, words?: [...] }
    const segments = (result.words || []).map((w: any) => ({
      start: w.start || 0,
      end: w.end || 0,
      text: w.word || ''
    }))

    // Group words into sentence-like segments (~10 words each)
    const grouped = groupWordsIntoSegments(segments, 10)

    return new Response(JSON.stringify({
      segments: grouped,
      fullText: result.text || '',
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
}

function groupWordsIntoSegments(words: { start: number; end: number; text: string }[], groupSize: number) {
  if (words.length === 0) return []

  const segments = []
  for (let i = 0; i < words.length; i += groupSize) {
    const chunk = words.slice(i, i + groupSize)
    segments.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map(w => w.text).join(' ').trim()
    })
  }
  return segments
}

// ── Summarize: accepts transcript text, returns structured summary ──

async function handleSummarize(request: Request, env: Env): Promise<Response> {
  try {
    const { transcript, meetingTitle } = await request.json() as { transcript: string; meetingTitle?: string }

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'Transcript is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const trimmed = transcript.slice(0, 15000)

    const prompt = `You are a meeting assistant. Analyze this meeting transcript and provide a structured summary.

${meetingTitle ? `Meeting: ${meetingTitle}\n` : ''}
Transcript:
${trimmed}

Respond ONLY with valid JSON in this exact format:
{
  "overview": "2-3 sentence summary of the meeting",
  "keyPoints": ["point 1", "point 2", ...],
  "actionItems": ["action 1", "action 2", ...],
  "decisions": ["decision 1", "decision 2", ...]
}

If there are no action items or decisions, use empty arrays. Keep each point concise.`

    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    })

    let summary
    try {
      const text = result.response || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      summary = jsonMatch ? JSON.parse(jsonMatch[0]) : { overview: text, keyPoints: [], actionItems: [], decisions: [] }
    } catch {
      summary = {
        overview: result.response || 'Failed to parse summary',
        keyPoints: [],
        actionItems: [],
        decisions: [],
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
}

// ── Generate Minutes: accepts transcript + metadata, returns structured meeting minutes ──

async function handleGenerateMinutes(request: Request, env: Env): Promise<Response> {
  try {
    const { transcript, meetingTitle, duration, date } = await request.json() as {
      transcript: string; meetingTitle?: string; duration?: number; date?: string
    }

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'Transcript is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const trimmed = transcript.slice(0, 15000)

    const prompt = `You are a professional meeting minutes assistant. Analyze this meeting transcript and generate structured meeting minutes.

${meetingTitle ? `Meeting Title: ${meetingTitle}` : ''}
${date ? `Date: ${date}` : ''}
${duration ? `Duration: ${Math.floor(duration / 60)} minutes` : ''}

Transcript:
${trimmed}

Generate professional meeting minutes. Use objective, neutral language. Focus on key discussions rather than verbatim transcription.

Respond ONLY with valid JSON in this exact format:
{
  "location": "Virtual Meeting",
  "attendees": ["Name 1", "Name 2"],
  "chairperson": "",
  "absentees": [],
  "agenda": ["Topic 1", "Topic 2", "Topic 3"],
  "discussions": [
    {
      "topic": "Topic title",
      "discussion": "Concise, objective summary of key points discussed",
      "outcome": "Result or conclusion reached"
    }
  ],
  "overview": "2-3 sentence executive summary of the entire meeting",
  "actionItems": [
    {
      "action": "What needs to be done",
      "owner": "Person responsible or TBD",
      "deadline": "Due date or TBD"
    }
  ],
  "decisions": ["Decision 1", "Decision 2"],
  "nextMeetingDate": "",
  "adjournmentTime": ""
}

Rules:
- Extract attendees from names mentioned in the transcript. Use empty array if none can be identified.
- Identify 3-7 main agenda topics from the flow of conversation.
- Each discussion item should be concise (1-3 sentences), NOT a verbatim quote.
- Action items must include owner and deadline when mentioned, otherwise use "TBD".
- Use neutral, professional language throughout.
- If information cannot be determined, use empty strings or arrays.`

    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.2,
    })

    let minutes
    try {
      const text = result.response || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      minutes = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        location: 'Virtual Meeting',
        attendees: [],
        chairperson: '',
        absentees: [],
        agenda: [],
        discussions: [],
        overview: text,
        actionItems: [],
        decisions: [],
        nextMeetingDate: '',
        adjournmentTime: ''
      }
    } catch {
      minutes = {
        location: 'Virtual Meeting',
        attendees: [],
        chairperson: '',
        absentees: [],
        agenda: [],
        discussions: [],
        overview: result.response || 'Failed to generate minutes',
        actionItems: [],
        decisions: [],
        nextMeetingDate: '',
        adjournmentTime: ''
      }
    }

    return new Response(JSON.stringify(minutes), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
}

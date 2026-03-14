interface Env {
  AI: any
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

// ── Transcribe: accepts a single audio chunk (WAV/WebM), returns transcript ──
// Clients are responsible for splitting long recordings into ~25s WAV chunks
// and sending each chunk individually to this endpoint.

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  try {
    const audioData = await request.arrayBuffer()

    if (!audioData || audioData.byteLength < 100) {
      return new Response(JSON.stringify({ error: 'No audio data received' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Reject chunks larger than 3MB — clients must pre-chunk audio into ~25s WAV segments
    // (25s @ 16kHz mono 16-bit = ~800KB; 25s @ 48kHz = ~2.4MB)
    const MAX_CHUNK_SIZE = 3 * 1024 * 1024 // 3MB
    if (audioData.byteLength > MAX_CHUNK_SIZE) {
      return new Response(JSON.stringify({
        error: `Audio chunk too large (${(audioData.byteLength / 1024 / 1024).toFixed(1)}MB). Max is 2MB. Client must split audio into ~25-second WAV chunks before uploading.`,
        size: audioData.byteLength,
      }), {
        status: 413,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Convert to number array for Workers AI Whisper
    const audioArray = [...new Uint8Array(audioData)]

    // Read optional language and task from query params
    const url = new URL(request.url)
    const language = url.searchParams.get('language') // e.g. 'en', 'fr'
    const task = url.searchParams.get('task')         // 'transcribe' or 'translate'

    const whisperInput: any = { audio: audioArray }
    if (language) whisperInput.language = language
    if (task) whisperInput.task = task

    const result = await env.AI.run('@cf/openai/whisper', whisperInput)

    // Result shape: { text: string, vtt?: string, words?: [...] }
    const words = (result.words || []).map((w: any) => ({
      start: w.start || 0,
      end: w.end || 0,
      text: w.word || ''
    }))

    const grouped = groupWordsIntoSegments(words, 10)

    return new Response(JSON.stringify({
      segments: grouped,
      fullText: result.text || '',
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message,
      size: request.headers.get('content-length') || 'unknown',
    }), {
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
  "decisions": ["decision 1", "decision 2", ...],
  "quotes": ["Notable quote 1", "Notable quote 2"]
}

Rules:
- If there are no action items or decisions, use empty arrays. Keep each point concise.
- Extract 2-5 notable or important direct quotes from the transcript. Use the exact words from the transcript.
- If no notable quotes can be identified, use an empty array.`

    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    })

    let summary
    try {
      const text = result.response || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      summary = jsonMatch ? JSON.parse(jsonMatch[0]) : { overview: text, keyPoints: [], actionItems: [], decisions: [], quotes: [] }
    } catch {
      summary = {
        overview: result.response || 'Failed to parse summary',
        keyPoints: [],
        actionItems: [],
        decisions: [],
        quotes: [],
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
  "quotes": [
    {"text": "The exact quote from the transcript", "speaker": "Name or Unknown"}
  ],
  "nextMeetingDate": "",
  "adjournmentTime": ""
}

Rules:
- Extract attendees from names mentioned in the transcript. Use empty array if none can be identified.
- Identify 3-7 main agenda topics from the flow of conversation.
- Each discussion item should be concise (1-3 sentences), NOT a verbatim quote.
- Action items must include owner and deadline when mentioned, otherwise use "TBD".
- Extract 2-5 notable direct quotes from speakers, using their exact words from the transcript.
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
        quotes: [],
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
        quotes: [],
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

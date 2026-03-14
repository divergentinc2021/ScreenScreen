import { Buffer } from 'node:buffer'

interface Env {
  AI: any
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Chunk size for Whisper: ~900KB keeps us safely under the ~1MB model limit
const CHUNK_SIZE = 900 * 1024

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

// ── Transcribe: accepts audio binary, chunks large files, returns full transcript ──

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  try {
    const audioData = await request.arrayBuffer()

    if (!audioData || audioData.byteLength < 100) {
      return new Response(JSON.stringify({ error: 'No audio data received' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const totalSize = audioData.byteLength
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE)

    // Small file — single pass (under 900KB)
    if (totalChunks <= 1) {
      return transcribeSingle(audioData, env)
    }

    // Large file — chunk and transcribe sequentially
    const allTexts: string[] = []
    const allWords: { start: number; end: number; text: string }[] = []
    let timeOffset = 0

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, totalSize)
      const chunkBuffer = audioData.slice(start, end)

      try {
        const encoded = Buffer.from(chunkBuffer).toString('base64')

        const result = await env.AI.run('@cf/openai/whisper', {
          audio: encoded,
        })

        if (result.text) {
          allTexts.push(result.text)
        }

        // Collect words with time offset for sequential chunks
        if (result.words && result.words.length > 0) {
          const chunkWords = result.words.map((w: any) => ({
            start: (w.start || 0) + timeOffset,
            end: (w.end || 0) + timeOffset,
            text: w.word || ''
          }))
          allWords.push(...chunkWords)

          // Estimate time offset: use the last word's end time from this chunk
          const lastWord = result.words[result.words.length - 1]
          timeOffset += (lastWord.end || 30)
        } else {
          // No words returned — estimate ~30s per chunk
          timeOffset += 30
        }
      } catch (chunkErr: any) {
        allTexts.push(`[chunk ${i + 1}/${totalChunks} failed: ${chunkErr.message}]`)
        timeOffset += 30
      }
    }

    const fullText = allTexts.join(' ')
    const grouped = groupWordsIntoSegments(allWords, 10)

    return new Response(JSON.stringify({
      segments: grouped,
      fullText,
      chunks: totalChunks,
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

// Single-pass transcription for small files
async function transcribeSingle(audioData: ArrayBuffer, env: Env): Promise<Response> {
  const encoded = Buffer.from(audioData).toString('base64')

  const result = await env.AI.run('@cf/openai/whisper', {
    audio: encoded,
  })

  const segments = (result.words || []).map((w: any) => ({
    start: w.start || 0,
    end: w.end || 0,
    text: w.word || ''
  }))

  const grouped = groupWordsIntoSegments(segments, 10)

  return new Response(JSON.stringify({
    segments: grouped,
    fullText: result.text || '',
    chunks: 1,
  }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
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

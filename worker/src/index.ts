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
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    if (url.pathname === '/api/summarize' && request.method === 'POST') {
      return handleSummarize(request, env)
    }

    return new Response(JSON.stringify({ status: 'ok', endpoint: '/api/summarize' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  },
}

async function handleSummarize(request: Request, env: Env): Promise<Response> {
  try {
    const { transcript, meetingTitle } = await request.json() as { transcript: string; meetingTitle?: string }

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'Transcript is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Truncate if extremely long (model context limit)
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
      // Extract JSON from response (handle markdown code blocks)
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

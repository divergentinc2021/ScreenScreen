import { BrowserWindow, shell } from 'electron'
import { google, calendar_v3 } from 'googleapis'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Google OAuth2 credentials (Desktop app — public client)
// Users authenticate via their own Google account
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET'
const REDIRECT_URI = 'http://localhost:18234/oauth2callback'

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

export class CalendarSync {
  private oauth2Client: any
  private calendar: calendar_v3.Calendar | null = null
  private settingsPath: string
  private pollTimer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private reminderMinutes = 5
  private notifiedEvents: Set<string> = new Set()

  constructor(baseDir: string) {
    this.settingsPath = join(baseDir, 'calendar-auth.json')
    this.oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

    // Restore saved tokens
    if (existsSync(this.settingsPath)) {
      try {
        const tokens = JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
        this.oauth2Client.setCredentials(tokens)
        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })
      } catch { /* ignore corrupt file */ }
    }
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  isConnected(): boolean {
    return !!this.calendar && !!this.oauth2Client.credentials?.refresh_token
  }

  /**
   * Start OAuth2 flow — opens browser for Google sign-in.
   * Returns a promise that resolves when auth is complete.
   */
  async authenticate(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const http = require('http')

      const server = http.createServer(async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://localhost:18234`)
          const code = url.searchParams.get('code')

          if (!code) {
            res.writeHead(400)
            res.end('No code received')
            server.close()
            resolve({ success: false, error: 'No authorization code received' })
            return
          }

          const { tokens } = await this.oauth2Client.getToken(code)
          this.oauth2Client.setCredentials(tokens)
          this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })

          // Save tokens
          writeFileSync(this.settingsPath, JSON.stringify(tokens, null, 2))

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`
            <html><body style="font-family:system-ui;text-align:center;padding:60px;background:#0f0f14;color:#fff">
              <h2>Connected to Google Calendar!</h2>
              <p style="color:#888">You can close this window and return to DiScreenRecorder.</p>
            </body></html>
          `)

          server.close()
          resolve({ success: true })
        } catch (err: any) {
          res.writeHead(500)
          res.end('Auth failed')
          server.close()
          resolve({ success: false, error: err.message })
        }
      })

      server.listen(18234, () => {
        const authUrl = this.oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent'
        })
        shell.openExternal(authUrl)
      })

      // Timeout after 2 minutes
      setTimeout(() => {
        try { server.close() } catch {}
        resolve({ success: false, error: 'Authentication timed out' })
      }, 120000)
    })
  }

  async disconnect(): Promise<void> {
    this.oauth2Client.revokeCredentials().catch(() => {})
    this.calendar = null
    this.oauth2Client.setCredentials({})
    if (existsSync(this.settingsPath)) {
      const { rmSync } = require('fs')
      rmSync(this.settingsPath)
    }
    this.stopPolling()
  }

  /**
   * Fetch upcoming events (next 24 hours) that have meeting links.
   */
  async getUpcomingEvents(): Promise<any[]> {
    if (!this.calendar) return []

    try {
      const now = new Date()
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: tomorrow.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20
      })

      const events = (res.data.items || []).map(event => {
        const meetingUrl = this.extractMeetingUrl(event)
        return {
          id: event.id || '',
          title: event.summary || 'Untitled Event',
          start: event.start?.dateTime || event.start?.date || '',
          end: event.end?.dateTime || event.end?.date || '',
          meetingUrl,
          platform: meetingUrl ? this.detectPlatform(meetingUrl) : undefined
        }
      })

      return events
    } catch (err: any) {
      console.error('Calendar fetch error:', err.message)
      return []
    }
  }

  /**
   * Start polling for upcoming meetings (every 60 seconds).
   */
  startPolling(reminderMinutes: number = 5) {
    this.reminderMinutes = reminderMinutes
    this.stopPolling()

    // Check immediately, then every 60 seconds
    this.checkUpcoming()
    this.pollTimer = setInterval(() => this.checkUpcoming(), 60000)
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async checkUpcoming() {
    if (!this.calendar || !this.mainWindow) return

    try {
      const events = await this.getUpcomingEvents()
      const now = Date.now()

      for (const event of events) {
        if (!event.meetingUrl) continue
        if (this.notifiedEvents.has(event.id)) continue

        const startTime = new Date(event.start).getTime()
        const minutesUntil = (startTime - now) / 60000

        if (minutesUntil > 0 && minutesUntil <= this.reminderMinutes) {
          this.notifiedEvents.add(event.id)
          this.mainWindow.webContents.send('meeting-reminder', event)
        }
      }

      // Clean up old notified events
      for (const id of this.notifiedEvents) {
        const event = events.find(e => e.id === id)
        if (!event) this.notifiedEvents.delete(id)
      }
    } catch { /* ignore polling errors */ }
  }

  private extractMeetingUrl(event: calendar_v3.Schema$Event): string | undefined {
    // Check hangout link (Google Meet)
    if (event.hangoutLink) return event.hangoutLink

    // Check conference data
    if (event.conferenceData?.entryPoints) {
      const videoEntry = event.conferenceData.entryPoints.find(
        ep => ep.entryPointType === 'video'
      )
      if (videoEntry?.uri) return videoEntry.uri
    }

    // Check description and location for meeting URLs
    const text = `${event.description || ''} ${event.location || ''}`
    const urlMatch = text.match(
      /https?:\/\/([\w-]+\.)?zoom\.us\/j\/\S+|https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/\S+|https?:\/\/meet\.google\.com\/\S+/i
    )
    return urlMatch ? urlMatch[0] : undefined
  }

  private detectPlatform(url: string): 'zoom' | 'teams' | 'meet' | 'other' {
    if (url.includes('zoom.us')) return 'zoom'
    if (url.includes('teams.microsoft.com')) return 'teams'
    if (url.includes('meet.google.com')) return 'meet'
    return 'other'
  }
}

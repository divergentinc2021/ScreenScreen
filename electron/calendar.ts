import { BrowserWindow } from 'electron'

/**
 * Google Calendar integration via Apps Script — multi-account support.
 *
 * Each Google account holder deploys their own copy of Code.gs as a web app
 * (Execute as: Me, Access: Anyone). The Electron app stores multiple script
 * URLs and fetches events from all of them, merging into a single feed.
 *
 * Setup per account:
 * 1. Open apps-script/Code.gs in Google Apps Script (logged into your Google account)
 * 2. Deploy as Web App (Execute as: Me, Access: Anyone)
 * 3. Add the URL in Settings → Google Calendar → Add Calendar
 */

export type CalendarSource = {
  name: string
  url: string
}

type CalendarEvent = {
  id: string
  title: string
  start: string
  end: string
  location: string
  meetingUrl: string | null
  platform: 'zoom' | 'teams' | 'meet' | 'other' | null
  calendarName?: string
}

export class CalendarSync {
  private sources: CalendarSource[] = []
  private pollTimer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private reminderMinutes = 5
  private notifiedEvents: Set<string> = new Set()

  constructor(_baseDir: string) {}

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  setSources(sources: CalendarSource[]) {
    this.sources = sources
  }

  isConnected(): boolean {
    return this.sources.length > 0
  }

  /**
   * Test a single Apps Script URL.
   */
  async testConnection(url: string): Promise<{ success: boolean; email?: string; error?: string }> {
    if (!url) {
      return { success: false, error: 'No URL provided.' }
    }

    try {
      const res = await fetch(`${url}?action=status`)
      const data = await res.json() as any
      if (data.status === 'ok') {
        return { success: true, email: data.email }
      }
      return { success: false, error: data.error || 'Unexpected response from script' }
    } catch (err: any) {
      return { success: false, error: `Connection failed: ${err.message}` }
    }
  }

  /**
   * Fetch upcoming events from ALL connected calendars.
   * Events are tagged with their source calendar name.
   */
  async getUpcomingEvents(): Promise<CalendarEvent[]> {
    if (this.sources.length === 0) return []

    const allEvents: CalendarEvent[] = []

    // Fetch from all sources in parallel
    const results = await Promise.allSettled(
      this.sources.map(async (source) => {
        try {
          const res = await fetch(`${source.url}?action=upcoming&hours=24`)
          const data = await res.json() as any
          const events = (data.events || []) as CalendarEvent[]
          // Tag each event with the calendar name
          return events.map(e => ({ ...e, calendarName: source.name }))
        } catch (err: any) {
          console.error(`Calendar fetch error (${source.name}):`, err.message)
          return []
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEvents.push(...result.value)
      }
    }

    // Sort by start time
    allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    return allEvents
  }

  /**
   * Start polling for upcoming meetings (every 60 seconds).
   */
  startPolling(reminderMinutes: number = 5) {
    this.reminderMinutes = reminderMinutes
    this.stopPolling()

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
    if (this.sources.length === 0 || !this.mainWindow) return

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
}

import { BrowserWindow } from 'electron'

/**
 * Google Calendar integration via Apps Script.
 *
 * Instead of OAuth in Electron, we deploy a Google Apps Script web app
 * that reads the user's own calendar. The Electron app just calls the
 * script URL — no client IDs, secrets, or token management needed.
 *
 * Setup:
 * 1. Open apps-script/Code.gs in Google Apps Script
 * 2. Deploy as Web App (Execute as: Me, Access: Anyone)
 * 3. Paste the URL in Settings → Google Calendar → Script URL
 */

type CalendarEvent = {
  id: string
  title: string
  start: string
  end: string
  location: string
  meetingUrl: string | null
  platform: 'zoom' | 'teams' | 'meet' | 'other' | null
}

export class CalendarSync {
  private scriptUrl: string = ''
  private pollTimer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private reminderMinutes = 5
  private notifiedEvents: Set<string> = new Set()

  constructor(_baseDir: string) {
    // baseDir kept for API compatibility but no longer needed
    // (no local token storage required)
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  setScriptUrl(url: string) {
    this.scriptUrl = url
  }

  isConnected(): boolean {
    return !!this.scriptUrl && this.scriptUrl.length > 0
  }

  /**
   * Test the Apps Script connection. No OAuth needed —
   * just verify the script URL responds.
   */
  async authenticate(): Promise<{ success: boolean; error?: string }> {
    if (!this.scriptUrl) {
      return { success: false, error: 'No Apps Script URL configured. Add it in Settings.' }
    }

    try {
      const res = await fetch(`${this.scriptUrl}?action=status`)
      const data = await res.json() as any
      if (data.status === 'ok') {
        return { success: true }
      }
      return { success: false, error: data.error || 'Unexpected response from script' }
    } catch (err: any) {
      return { success: false, error: `Connection failed: ${err.message}` }
    }
  }

  async disconnect(): Promise<void> {
    this.scriptUrl = ''
    this.stopPolling()
  }

  /**
   * Fetch upcoming events (next 24 hours) from Apps Script.
   */
  async getUpcomingEvents(): Promise<CalendarEvent[]> {
    if (!this.scriptUrl) return []

    try {
      const res = await fetch(`${this.scriptUrl}?action=upcoming&hours=24`)
      const data = await res.json() as any
      return data.events || []
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
    if (!this.scriptUrl || !this.mainWindow) return

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

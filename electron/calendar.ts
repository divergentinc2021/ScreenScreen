import { BrowserWindow, session } from 'electron'

/**
 * Google Calendar integration via Apps Script — any Google account.
 *
 * The Apps Script is deployed as "Execute as: User accessing the web app"
 * so it runs as whoever visits the URL and reads THEIR calendar.
 *
 * Auth flow:
 * 1. User clicks "Sign in with Google" in the Electron app
 * 2. Electron opens a BrowserWindow with a persistent session partition
 * 3. User signs into their Google account and authorizes the script
 * 4. Electron saves the partition ID — Google cookies persist across restarts
 * 5. For polling, uses session.fetch() with the saved partition (includes cookies)
 *
 * No OAuth client IDs, no tokens — the BrowserWindow IS the auth.
 */

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx4aXyQVt2vBxPsLvl4PV3VCNuA3rfQ1mH9nugbormP59STbqLt1coRdjsqaHYl33pf-A/exec'

export type CalendarAccount = {
  name: string       // Display name (e.g. email)
  partition: string   // Electron session partition (e.g. 'persist:cal-0')
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
  private accounts: CalendarAccount[] = []
  private scriptUrl: string = SCRIPT_URL
  private pollTimer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private reminderMinutes = 5
  private notifiedEvents: Set<string> = new Set()

  constructor(_baseDir: string) {}

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  setAccounts(accounts: CalendarAccount[]) {
    this.accounts = accounts
  }

  setScriptUrl(url: string) {
    if (url) this.scriptUrl = url
  }

  isConnected(): boolean {
    return this.accounts.length > 0
  }

  /**
   * Open a BrowserWindow for Google sign-in.
   * Returns the user's email on success.
   */
  async signIn(partitionName: string): Promise<{ success: boolean; email?: string; error?: string }> {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        title: 'Sign in with Google',
        webPreferences: {
          partition: partitionName,
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      // After Google auth + Apps Script authorization, the page will show JSON
      // with { status: 'ok', email: '...' }
      const statusUrl = `${this.scriptUrl}?action=status`

      let resolved = false

      const checkForAuth = async () => {
        if (resolved) return
        try {
          const currentUrl = authWindow.webContents.getURL()
          // If we've been redirected back to the script URL (not Google sign-in),
          // try to read the response
          if (currentUrl.includes('script.google.com/macros') || currentUrl.includes('script.googleusercontent.com')) {
            const content = await authWindow.webContents.executeJavaScript(
              'document.body?.innerText || document.body?.textContent || ""'
            )
            try {
              const data = JSON.parse(content)
              if (data.status === 'ok' && data.email) {
                resolved = true
                authWindow.close()
                resolve({ success: true, email: data.email })
                return
              }
            } catch {
              // Not JSON yet, user still authorizing
            }
          }
        } catch {
          // Window might be closed
        }
      }

      // Check periodically for completed auth
      const pollInterval = setInterval(checkForAuth, 1500)

      // Also check on page finish loading
      authWindow.webContents.on('did-finish-load', () => {
        setTimeout(checkForAuth, 500)
      })

      authWindow.on('closed', () => {
        clearInterval(pollInterval)
        if (!resolved) {
          resolved = true
          resolve({ success: false, error: 'Sign-in window was closed' })
        }
      })

      authWindow.loadURL(statusUrl)
    })
  }

  /**
   * Test if a saved session partition still has valid Google auth.
   */
  async testSession(partitionName: string): Promise<{ success: boolean; email?: string; error?: string }> {
    try {
      const ses = session.fromPartition(partitionName)
      const res = await ses.fetch(`${this.scriptUrl}?action=status`, {
        redirect: 'follow' as RequestRedirect
      })

      // If Google redirects to sign-in page, the session expired
      const finalUrl = res.url
      if (finalUrl.includes('accounts.google.com') || finalUrl.includes('ServiceLogin')) {
        return { success: false, error: 'Session expired. Please sign in again.' }
      }

      const text = await res.text()
      try {
        const data = JSON.parse(text)
        if (data.status === 'ok' && data.email) {
          return { success: true, email: data.email }
        }
        return { success: false, error: data.error || 'Unexpected response' }
      } catch {
        // Response is HTML (Google login page), not JSON
        return { success: false, error: 'Session expired. Please sign in again.' }
      }
    } catch (err: any) {
      return { success: false, error: `Connection failed: ${err.message}` }
    }
  }

  /**
   * Remove a session (clear its cookies).
   */
  async removeSession(partitionName: string): Promise<void> {
    try {
      const ses = session.fromPartition(partitionName)
      await ses.clearStorageData()
    } catch {
      // Partition may not exist
    }
  }

  /**
   * Fetch upcoming events from ALL connected accounts.
   */
  async getUpcomingEvents(): Promise<CalendarEvent[]> {
    if (this.accounts.length === 0) return []

    const allEvents: CalendarEvent[] = []

    const results = await Promise.allSettled(
      this.accounts.map(async (account) => {
        try {
          const ses = session.fromPartition(account.partition)
          const res = await ses.fetch(`${this.scriptUrl}?action=upcoming&hours=24`, {
            redirect: 'follow' as RequestRedirect
          })

          const text = await res.text()
          let data: any
          try {
            data = JSON.parse(text)
          } catch {
            console.error(`Calendar response not JSON (${account.name}): session may have expired`)
            return []
          }

          const events = (data.events || []) as CalendarEvent[]
          return events.map(e => ({ ...e, calendarName: account.name }))
        } catch (err: any) {
          console.error(`Calendar fetch error (${account.name}):`, err.message)
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
    if (this.accounts.length === 0 || !this.mainWindow) return

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

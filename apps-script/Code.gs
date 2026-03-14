/**
 * DiScreenRecorder — Google Calendar Integration
 *
 * Deploy as Web App:
 *   Execute as: Me (your Google account)
 *   Who has access: Anyone (or Anyone with link)
 *
 * The Electron app calls this script URL to get upcoming calendar events.
 * No OAuth needed in the app — Apps Script runs under your own Google account.
 */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'upcoming'

  try {
    switch (action) {
      case 'upcoming':
        return jsonResponse(getUpcomingEvents(e))
      case 'status':
        return jsonResponse({ status: 'ok', email: Session.getActiveUser().getEmail() })
      default:
        return jsonResponse({ error: 'Unknown action: ' + action }, 400)
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
}

function doPost(e) {
  return doGet(e)
}

/**
 * Get upcoming events in the next N hours (default 24).
 */
function getUpcomingEvents(e) {
  const hours = parseInt((e && e.parameter && e.parameter.hours) || '24', 10)
  const now = new Date()
  const future = new Date(now.getTime() + hours * 60 * 60 * 1000)

  const events = CalendarApp.getDefaultCalendar().getEvents(now, future)

  return {
    events: events.map(function(event) {
      var meetingUrl = extractMeetingUrl(event)
      return {
        id: event.getId(),
        title: event.getTitle(),
        start: event.getStartTime().toISOString(),
        end: event.getEndTime().toISOString(),
        location: event.getLocation() || '',
        meetingUrl: meetingUrl,
        platform: meetingUrl ? detectPlatform(meetingUrl) : null
      }
    })
  }
}

/**
 * Extract Zoom, Teams, or Google Meet URL from event.
 */
function extractMeetingUrl(event) {
  // Check location field
  var location = event.getLocation() || ''
  var url = findMeetingUrl(location)
  if (url) return url

  // Check description
  var desc = event.getDescription() || ''
  url = findMeetingUrl(desc)
  if (url) return url

  // Check for Google Meet (hangout link)
  // In Apps Script, conference data isn't directly accessible via CalendarApp,
  // but we can use the Advanced Calendar Service
  try {
    var calEvent = Calendar.Events.get('primary', event.getId().replace(/@google.com$/, ''))
    if (calEvent.hangoutLink) return calEvent.hangoutLink
    if (calEvent.conferenceData && calEvent.conferenceData.entryPoints) {
      for (var i = 0; i < calEvent.conferenceData.entryPoints.length; i++) {
        var ep = calEvent.conferenceData.entryPoints[i]
        if (ep.entryPointType === 'video' && ep.uri) return ep.uri
      }
    }
  } catch (e) {
    // Advanced Calendar service not enabled — fall back to URL extraction
  }

  return null
}

/**
 * Find a meeting URL in text.
 */
function findMeetingUrl(text) {
  if (!text) return null

  // Google Meet
  var meetMatch = text.match(/https?:\/\/meet\.google\.com\/[a-z\-]+/i)
  if (meetMatch) return meetMatch[0]

  // Zoom
  var zoomMatch = text.match(/https?:\/\/([\w-]+\.)?zoom\.us\/j\/\S+/i)
  if (zoomMatch) return zoomMatch[0]

  // Microsoft Teams
  var teamsMatch = text.match(/https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/\S+/i)
  if (teamsMatch) return teamsMatch[0]

  return null
}

/**
 * Detect meeting platform from URL.
 */
function detectPlatform(url) {
  if (url.indexOf('zoom.us') >= 0) return 'zoom'
  if (url.indexOf('teams.microsoft.com') >= 0) return 'teams'
  if (url.indexOf('meet.google.com') >= 0) return 'meet'
  return 'other'
}

/**
 * Return JSON response with CORS headers.
 */
function jsonResponse(data, code) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

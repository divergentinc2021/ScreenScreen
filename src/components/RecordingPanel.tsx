import { useState, useRef, useEffect, useCallback } from 'react'
import { useMeetingStore } from '../stores/meetingStore'

type Source = { id: string; name: string; thumbnail: string }

export default function RecordingPanel() {
  const { isRecording, recordingTime, setRecording, setRecordingTime, loadMeetings, selectMeeting } = useMeetingStore()
  const [sources, setSources] = useState<Source[]>([])
  const [selectedSource, setSelectedSource] = useState<Source | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [title, setTitle] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const loadSources = async () => {
    const srcs = await window.api.getSources()
    setSources(srcs)
    setShowPicker(true)
  }

  const startRecording = useCallback(async () => {
    if (!selectedSource) {
      await loadSources()
      return
    }

    try {
      // Get screen audio
      const screenStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-ignore - Electron specific constraints
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id
          }
        },
        video: {
          // @ts-ignore
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            maxWidth: 1,
            maxHeight: 1
          }
        }
      })

      // Get mic audio
      let micStream: MediaStream | null = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        // Continue without mic if permission denied
      }

      // Mix streams
      const audioContext = new AudioContext()
      const destination = audioContext.createMediaStreamDestination()

      const screenAudio = audioContext.createMediaStreamSource(screenStream)
      screenAudio.connect(destination)

      if (micStream) {
        const micAudio = audioContext.createMediaStreamSource(micStream)
        micAudio.connect(destination)
      }

      // Stop video track (we only need audio)
      screenStream.getVideoTracks().forEach(t => t.stop())

      // Record
      const recorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(1000)
      mediaRecorderRef.current = recorder
      startTimeRef.current = Date.now()
      setRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)

    } catch (err: any) {
      alert(`Recording failed: ${err.message}`)
    }
  }, [selectedSource])

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current)

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const buffer = await blob.arrayBuffer()
        const duration = (Date.now() - startTimeRef.current) / 1000

        const meeting = await window.api.saveRecording(
          buffer,
          duration,
          title || `Meeting ${new Date().toLocaleDateString('en-ZA')}`
        )

        setRecording(false)
        setRecordingTime(0)
        setTitle('')
        await loadMeetings()
        await selectMeeting(meeting.id)
        resolve()
      }

      recorder.stop()
      recorder.stream.getTracks().forEach(t => t.stop())
    })
  }, [title])

  const selectSource = (source: Source) => {
    setSelectedSource(source)
    setShowPicker(false)
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      {/* Title input */}
      <input
        type="text"
        placeholder="Meeting title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={isRecording}
        className="w-80 px-4 py-2.5 bg-surface border border-border rounded-lg text-center text-sm focus:outline-none focus:border-accent placeholder:text-muted disabled:opacity-50"
      />

      {/* Timer */}
      <div className="text-5xl font-mono font-light tracking-widest text-text">
        {formatTime(recordingTime)}
      </div>

      {/* Source indicator */}
      {selectedSource && !isRecording && (
        <button
          onClick={loadSources}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface2 rounded-full text-xs text-muted hover:text-text transition"
        >
          <span className="w-2 h-2 rounded-full bg-green" />
          {selectedSource.name}
          <span className="text-muted">· click to change</span>
        </button>
      )}

      {/* Record button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className="relative group"
      >
        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
          isRecording
            ? 'bg-red/20 hover:bg-red/30'
            : 'bg-accent/20 hover:bg-accent/30'
        }`}>
          {isRecording ? (
            <>
              <div className="pulse-ring absolute inset-0 rounded-full" />
              <div className="w-8 h-8 bg-red rounded-md" />
            </>
          ) : (
            <div className="w-10 h-10 bg-red rounded-full" />
          )}
        </div>
      </button>

      <p className="text-muted text-sm">
        {isRecording ? 'Click to stop recording' : selectedSource ? 'Click to start recording' : 'Select a screen or window to record'}
      </p>

      {/* Source picker modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl border border-border p-6 max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-heading font-semibold text-lg">Choose a source</h2>
              <button onClick={() => setShowPicker(false)} className="text-muted hover:text-text text-xl">&times;</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {sources.map((src) => (
                <button
                  key={src.id}
                  onClick={() => selectSource(src)}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition"
                >
                  <img src={src.thumbnail} alt={src.name} className="w-full rounded" />
                  <span className="text-xs text-center truncate w-full">{src.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

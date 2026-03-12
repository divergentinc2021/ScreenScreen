# DiScreenRecorder

Desktop meeting recorder with AI transcription, summaries, and professional meeting minutes.

Built with Electron + React 19 + TypeScript + Tailwind v4 + Cloudflare Workers AI.

## Features

- **Screen & audio recording** — capture any window or screen via Electron's desktopCapturer
- **Cloud transcription** — Cloudflare Workers AI (Whisper) for fast, accurate speech-to-text
- **Local transcription** — whisper.cpp bundled binary for offline/private transcription (no cloud needed)
- **AI summaries** — structured overview, key points, action items, and decisions via Llama 3.1
- **Professional meeting minutes** — attendees, agenda, per-topic discussion notes, action items table (owner + deadline + status), decisions, closing info
- **Export** — PDF (non-editable), Markdown, or clipboard
- **Model management** — download/delete Whisper models (tiny → large) from Settings
- **Dark theme** — consistent dark UI across the app

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron (Main Process)                │
│  ├── localTranscriber.ts (whisper.cpp)  │
│  ├── storage.ts (~/MeetingRecorder/)    │
│  ├── minutesExporter.ts (PDF/MD/clip)   │
│  └── main.ts (IPC handlers)            │
├─────────────────────────────────────────┤
│  React Renderer (Vite)                  │
│  ├── App.tsx (views + routing)          │
│  ├── SettingsPanel.tsx (local/cloud)    │
│  ├── MeetingMinutesView.tsx             │
│  └── meetingStore.ts (Zustand)          │
├─────────────────────────────────────────┤
│  Cloudflare Worker (shared backend)     │
│  ├── /api/transcribe (Whisper)          │
│  ├── /api/summarize (Llama 3.1)        │
│  └── /api/generate-minutes (Llama 3.1) │
└─────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare account (for cloud transcription)

### Development

```bash
npm install
npm run dev          # Runs Vite + Electron concurrently
```

### Worker (Backend)

```bash
npm run worker:dev     # Local dev with Wrangler
npm run worker:deploy  # Deploy to Cloudflare
```

### Build & Package

```bash
npm run build          # Build renderer + electron
npm run dist:mac       # Package for macOS
npm run dist:win       # Package for Windows
```

### Local Transcription Setup

1. Place whisper.cpp binaries in `binaries/whisper/`:
   - `mac-arm64/whisper-cli` (compile from [whisper.cpp](https://github.com/ggml-org/whisper.cpp))
   - `mac-x64/whisper-cli`
   - `win-x64/whisper-cli.exe` (from [releases](https://github.com/ggml-org/whisper.cpp/releases))
2. In the app, go to **Settings → Local mode** and download a model (base recommended)
3. Record → Transcribe uses the local whisper binary

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 40 |
| Frontend | React 19, TypeScript, Tailwind v4 |
| State | Zustand |
| Build | Vite 7 |
| Cloud AI | Cloudflare Workers AI (Whisper + Llama 3.1 8B) |
| Local AI | whisper.cpp (C++ binary via child_process) |
| Audio | ffmpeg-static (WebM → WAV conversion) |
| PDF Export | Electron printToPDF (hidden BrowserWindow) |

## Project Structure

```
MeetingRecorder/
├── electron/
│   ├── main.ts              # Electron main process + IPC
│   ├── preload.ts           # Context bridge API
│   ├── storage.ts           # File-based storage (~~/MeetingRecorder/)
│   ├── transcriber.ts       # Cloud transcription client
│   ├── localTranscriber.ts  # whisper.cpp integration
│   └── minutesExporter.ts   # PDF, Markdown, clipboard export
├── src/
│   ├── App.tsx              # Main app with view routing
│   ├── global.d.ts          # TypeScript type definitions
│   ├── stores/
│   │   └── meetingStore.ts  # Zustand store
│   └── components/
│       ├── SettingsPanel.tsx       # Local/cloud mode + model manager
│       └── MeetingMinutesView.tsx  # Professional minutes viewer
├── worker/
│   └── src/index.ts         # Cloudflare Worker (3 endpoints)
├── binaries/whisper/        # Platform-specific whisper-cli (gitignored)
└── scripts/
    └── fix-permissions.js   # afterPack hook for macOS binary permissions
```

## Related

- **[DiScribe PWA](https://github.com/divergentinc2021/DiScribeWeb)** — lightweight web version with template presets, works on any device

## License

MIT — Divergent Inc

# Local Whisper

A Windows desktop app for local voice-to-text transcription, powered by [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Press a global hotkey from any window, speak, and the transcribed text is pasted into whatever you're typing in. Everything runs locally on your machine.

## Features

- **Global hotkey** (Ctrl+Shift+Space) to record from anywhere on your desktop
- **Hybrid transcription**: streams a real-time preview with the tiny model, then runs a final pass with your selected model for accuracy
- **Floating overlay** shows live transcription progress
- **Auto-paste** into the focused text field via clipboard simulation
- **Toggle and push-to-talk** recording modes
- **Model management** built into the app (download/delete models from tiny through large)
- **14 languages** plus auto-detect
- **Fully offline**, no cloud APIs, no data leaves your machine
- Transcription history, system tray support, light/dark theme

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | Electron, Vite |
| UI | React 19, TypeScript, Tailwind CSS v4, Framer Motion |
| Speech-to-text | whisper.cpp (`whisper-cli.exe` for batch, `whisper-stream.exe` for real-time) |
| Audio | ffmpeg (format conversion) |
| System hooks | uiohook-napi (global keyboard hooks) |
| Storage | electron-store |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [ffmpeg](https://ffmpeg.org/) in your PATH
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp/releases) binaries placed in `resources/whisper/`:
  - `whisper-cli.exe` (required)
  - `whisper-stream.exe` (optional, enables real-time streaming preview)

### Setup

```bash
git clone <repo-url>
cd local-whisper
npm install
npm run dev
```

Open Settings in the app and download a model (start with Base for a good balance). Then press **Ctrl+Shift+Space** to start recording.

## Project Structure

```
src/
├── main/       # Electron main process: hotkeys, whisper process management,
│               # recording, overlay window, text injection, IPC
├── renderer/   # React UI: home page (recording + history), settings (models, config)
├── preload/    # Context bridge for IPC between main and renderer
└── shared/     # Shared types and constants
```

## How It Works

1. A global keyboard hook (uiohook-napi) listens for the configured hotkey.
2. When triggered, the main process starts recording audio from the default input device.
3. If streaming is enabled, `whisper-stream.exe` runs the tiny model in real-time and sends partial transcription to the floating overlay via IPC.
4. When recording stops, the audio is converted with ffmpeg and passed to `whisper-cli.exe` running your selected model for a final, higher-accuracy transcription.
5. The result replaces the streaming preview and is pasted into the focused text field using clipboard simulation (write to clipboard, then simulate Ctrl+V).

## Building

```bash
npm run dev        # Dev server with hot reload
npm run build      # Production build
npm run package    # Create Windows installer (.exe)
```

Pushes to `main` trigger a GitHub Actions workflow that builds and publishes the Windows installer as a release asset.

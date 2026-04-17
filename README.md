# Local Whisper

A local voice transcription app for Windows, powered by [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Press a global hotkey anywhere and your voice is transcribed directly into the focused text field.

## Features

- 🎙️ **Global Hotkey** — Ctrl+Shift+Space to start/stop recording from anywhere
- 🔄 **Real-time Overlay** — See transcription progress in a floating overlay
- 📝 **Auto-paste** — Transcription is automatically typed into the focused text field
- 🏠 **Fully Local** — All processing done on your machine, no cloud APIs
- ⚡ **Multiple Models** — Choose from Tiny to Large for speed vs accuracy
- 🎛️ **Push-to-talk & Toggle** — Two recording modes to suit your workflow

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [ffmpeg](https://ffmpeg.org/) in your PATH (for audio conversion)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp/releases) `main.exe` binary

### Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Place the whisper.cpp `main.exe` binary in `resources/whisper/`:
   ```
   resources/whisper/main.exe
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open Settings in the app and download a Whisper model (start with "Base" for a good balance).

5. Press **Ctrl+Shift+Space** to start recording!

## Development

```bash
npm run dev      # Start dev server with hot reload
npm run build    # Build for production
npm run package  # Create Windows installer
```

## Automated releases

Pushes to `main` trigger `.github/workflows/release.yml`, which builds the Windows installer and publishes the generated `.exe` as a new GitHub Release asset.

## Tech Stack

- **Electron** + **Vite** + **React** — Modern desktop app framework
- **whisper.cpp** — Fast C++ inference engine for OpenAI's Whisper model
- **uiohook-napi** — Low-level keyboard hooks for global hotkeys
- **electron-store** — Persistent settings storage

import { clipboard } from 'electron'
import { spawn } from 'child_process'

// Save the clipboard content before we overwrite it
let savedClipboard: string = ''

export async function injectText(text: string): Promise<void> {
  // Save current clipboard
  savedClipboard = clipboard.readText()

  // Write transcription to clipboard
  clipboard.writeText(text)

  // Small delay to ensure clipboard is updated
  await sleep(50)

  // Simulate Ctrl+V using PowerShell
  await simulatePaste()

  // Restore clipboard after a short delay
  await sleep(200)
  clipboard.writeText(savedClipboard)
}

function simulatePaste(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use PowerShell + .NET SendKeys to simulate Ctrl+V
    const ps = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`
    ])

    ps.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Paste simulation failed with code ${code}`))
    })

    ps.on('error', reject)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

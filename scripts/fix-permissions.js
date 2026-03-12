const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

exports.default = async function (context) {
  if (context.electronPlatformName === 'darwin') {
    const appName = context.packager.appInfo.productFilename
    const whisperPath = path.join(
      context.appOutDir,
      `${appName}.app`,
      'Contents',
      'Resources',
      'whisper',
      'whisper-cli'
    )

    if (fs.existsSync(whisperPath)) {
      console.log(`Setting execute permission on: ${whisperPath}`)
      execSync(`chmod +x "${whisperPath}"`)
    } else {
      console.log(`whisper-cli not found at: ${whisperPath} (local transcription will not be available)`)
    }

    // Also ensure ffmpeg has execute permission
    const ffmpegPath = path.join(
      context.appOutDir,
      `${appName}.app`,
      'Contents',
      'Resources',
      'ffmpeg'
    )
    if (fs.existsSync(ffmpegPath)) {
      execSync(`chmod +x "${ffmpegPath}"`)
    }
  }
}

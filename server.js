const express = require('express')
const path = require('path')
const sharp = require('sharp')
const multer = require('multer')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const { promisify } = require('util')

const app = express()

// Ensure uploads and outputs directories exist
const uploadsDir = path.join(__dirname, 'uploads')
const outputsDir = path.join(__dirname, 'outputs')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true })
}

const upload = multer({ dest: uploadsDir })
const unlink = promisify(fs.unlink)

// Middleware
app.use(express.json())
app.use(express.static(__dirname))

// Serve gif.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'gif.html'))
})

// Convert video to GIF endpoint
app.post('/api/convert', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' })
  }

  const { fps = 15, width = 480, height = 0 } = req.body
  const widthNum = parseInt(width) || 480
  const heightNum = parseInt(height) || 0
  const inputPath = path.resolve(req.file.path)
  const timestamp = Date.now()

  // Ensure outputs directory exists and is writable
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true, mode: 0o755 })
  }

  // Verify input file exists
  if (!fs.existsSync(inputPath)) {
    return res.status(400).json({ error: 'Input file not found' })
  }

  // Use simple filenames to avoid path issues
  const outputFilename = `${timestamp}.gif`
  const paletteFilename = `palette_${timestamp}.png`
  const outputPath = path.join(outputsDir, outputFilename)
  const palettePath = path.join(outputsDir, paletteFilename)

  console.log('Input path:', inputPath)
  console.log('Output path:', outputPath)
  console.log('Palette path:', palettePath)
  console.log('Outputs dir exists:', fs.existsSync(outputsDir))
  console.log('FPS:', fps, 'Width:', widthNum, 'Height:', heightNum || 'auto')

  // Determine size string for FFmpeg
  const sizeString = heightNum > 0 ? `${widthNum}x${heightNum}` : `${widthNum}:-1`

  try {
    // Step 1: Generate palette (high quality)
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoFilters([
          `fps=${fps}`,
          `scale=${sizeString}:flags=lanczos`,
          'palettegen=max_colors=256',
        ])
        .outputOptions(['-y']) // Overwrite output file
        .output(palettePath)
        .on('start', commandLine => {
          console.log('Palette generation command:', commandLine)
        })
        .on('progress', progress => {
          if (progress.percent) {
            console.log('Palette progress:', Math.round(progress.percent) + '%')
          }
        })
        .on('end', () => {
          console.log('Palette generated successfully')
          if (fs.existsSync(palettePath)) {
            console.log('Palette file exists, size:', fs.statSync(palettePath).size, 'bytes')
          }
          resolve()
        })
        .on('error', (err, stdout, stderr) => {
          console.error('Palette generation error:', err.message)
          console.error('FFmpeg stderr:', stderr)
          console.error('FFmpeg stdout:', stdout)
          reject(err)
        })

      command.run()
    })

    // Step 2: Create GIF with palette (high quality)
    await new Promise((resolve, reject) => {
      const scaleFilter =
        heightNum > 0
          ? `scale=${widthNum}:${heightNum}:flags=lanczos`
          : `scale=${widthNum}:-1:flags=lanczos`

      ffmpeg(inputPath)
        .input(palettePath)
        .complexFilter([
          `[0:v]fps=${fps},${scaleFilter}[x]`,
          '[x][1:v]paletteuse=dither=bayer:bayer_scale=5',
        ])
        .outputOptions([
          '-loop 0', // Infinite loop
        ])
        .output(outputPath)
        .on('start', commandLine => {
          console.log('GIF creation command:', commandLine)
        })
        .on('progress', progress => {
          if (progress.percent) {
            console.log('GIF creation progress:', Math.round(progress.percent) + '%')
          }
        })
        .on('end', () => {
          console.log('GIF created successfully')
          resolve()
        })
        .on('error', (err, stdout, stderr) => {
          console.error('GIF creation error:', err.message)
          console.error('FFmpeg stderr:', stderr)
          reject(err)
        })
        .run()
    })

    // Verify output file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Output file was not created')
    }

    // Send the GIF file
    res.setHeader('Content-Type', 'image/gif')
    res.setHeader('Content-Disposition', `attachment; filename="converted.gif"`)
    res.sendFile(outputPath, err => {
      if (err) {
        console.error('Error sending file:', err)
      }
      // Cleanup files after a delay
      setTimeout(() => {
        unlink(inputPath).catch(() => {})
        unlink(palettePath).catch(() => {})
        unlink(outputPath).catch(() => {})
      }, 60000) // Delete after 1 minute
    })
  } catch (error) {
    console.error('Conversion error:', error)
    // Cleanup on error
    unlink(inputPath).catch(() => {})
    unlink(palettePath).catch(() => {})
    if (fs.existsSync(outputPath)) {
      unlink(outputPath).catch(() => {})
    }
    res.status(500).json({ error: error.message || 'Conversion failed' })
  }
})

// New Image Resize Endpoint
app.post('/api/resize-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' })
  }

  const { width, height } = req.body
  const widthNum = parseInt(width)
  const heightNum = parseInt(height) || null // sharp uses null for auto-aspect
  const inputPath = req.file.path
  const outputPath = path.join(outputsDir, `resized-${Date.now()}-${req.file.originalname}`)

  try {
    await sharp(inputPath)
      .resize(widthNum, heightNum, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(outputPath)

    res.download(outputPath, `resized-${req.file.originalname}`, err => {
      // Cleanup
      fs.unlinkSync(inputPath)
      setTimeout(() => fs.unlinkSync(outputPath), 5000)
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Image processing failed' })
  }
})

app.listen(8000, () => {
  console.log('Server running at http://localhost:8000')
  console.log('Open http://localhost:8000 in your browser to use the GIF converter')
  console.log('Note: Make sure FFmpeg is installed on your system')
})

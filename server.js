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

const unlinkSafe = async filePath => {
  if (!filePath) return
  try {
    await unlink(filePath)
  } catch {
    // ignore cleanup errors
  }
}

const ffprobeAsync = filePath =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err)
        return
      }
      resolve(data)
    })
  })

const runGifCompression = ({ inputPath, outputPath, width, fps }) =>
  new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .complexFilter([
        `[0:v]fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1]`,
        '[s0]palettegen=max_colors=128[p]',
        '[s1][p]paletteuse=dither=bayer:bayer_scale=3',
      ])
      .outputOptions(['-loop 0', '-y'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', err => reject(err))
      .run()
  })

const compressGifToTarget = async (inputPath, targetBytes, baseName) => {
  const probe = await ffprobeAsync(inputPath)
  const videoStream = probe.streams.find(stream => stream.codec_type === 'video')
  const sourceWidth = videoStream?.width || 800
  const scaleFactors = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]
  const fpsOptions = [15, 12, 10, 8, 6]

  let best = { path: null, size: Number.POSITIVE_INFINITY }

  for (const scaleFactor of scaleFactors) {
    const scaledWidth = Math.max(80, Math.round(sourceWidth * scaleFactor))

    for (const fps of fpsOptions) {
      const outputPath = path.join(outputsDir, `${baseName}-${scaledWidth}-${fps}.gif`)
      await runGifCompression({ inputPath, outputPath, width: scaledWidth, fps })

      const size = fs.statSync(outputPath).size

      if (size < best.size) {
        await unlinkSafe(best.path)
        best = { path: outputPath, size }
      } else {
        await unlinkSafe(outputPath)
      }

      if (size <= targetBytes) {
        return { outputPath: best.path, size: best.size, achieved: true }
      }
    }
  }

  return { outputPath: best.path, size: best.size, achieved: false }
}

const compressImageToTarget = async (inputPath, targetBytes) => {
  const metadata = await sharp(inputPath).metadata()
  const sourceWidth = metadata.width || 2000
  const sourceHeight = metadata.height || 2000
  const sourceFormat = (metadata.format || '').toLowerCase()
  const outputFormat = ['jpeg', 'png', 'webp'].includes(sourceFormat) ? sourceFormat : 'jpeg'

  const scaleFactors = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]
  let bestUnderTarget = null
  let smallestOverall = null

  for (const scaleFactor of scaleFactors) {
    const targetWidth = Math.max(64, Math.round(sourceWidth * scaleFactor))
    const targetHeight = Math.max(64, Math.round(sourceHeight * scaleFactor))

    let low = 20
    let high = 95

    for (let i = 0; i < 7; i++) {
      const quality = Math.round((low + high) / 2)
      let pipeline = sharp(inputPath)
        .rotate()
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })

      if (outputFormat === 'jpeg') {
        pipeline = pipeline.jpeg({ quality, mozjpeg: true })
      } else if (outputFormat === 'png') {
        pipeline = pipeline.png({ quality, compressionLevel: 9, palette: true, effort: 10 })
      } else {
        pipeline = pipeline.webp({ quality })
      }

      const buffer = await pipeline.toBuffer()
      const size = buffer.length
      const candidate = { buffer, size, format: outputFormat }

      if (!smallestOverall || size < smallestOverall.size) {
        smallestOverall = candidate
      }

      if (size <= targetBytes) {
        if (!bestUnderTarget || size > bestUnderTarget.size) {
          bestUnderTarget = candidate
        }
        low = quality + 1
      } else {
        high = quality - 1
      }
    }
  }

  const finalResult = bestUnderTarget || smallestOverall
  const extension = finalResult.format === 'jpeg' ? 'jpg' : finalResult.format
  const mimeType = `image/${finalResult.format === 'jpg' ? 'jpeg' : finalResult.format}`

  return {
    buffer: finalResult.buffer,
    size: finalResult.size,
    extension,
    mimeType,
    achieved: Boolean(bestUnderTarget),
  }
}

// Middleware
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.static(path.join(__dirname, 'pages')))

// Root redirects to GIF page
app.get('/', (req, res) => {
  res.redirect('/gif/')
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

app.post('/api/compress-media', upload.single('media'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' })
  }

  const inputPath = req.file.path
  const originalSize = req.file.size
  const targetSizeMB = parseFloat(req.body.targetSizeMB)

  if (!targetSizeMB || targetSizeMB <= 0) {
    await unlinkSafe(inputPath)
    return res.status(400).json({ error: 'Target size must be greater than 0 MB' })
  }

  const targetBytes = Math.round(targetSizeMB * 1024 * 1024)
  const extension = path.extname(req.file.originalname).toLowerCase()
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
  const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  if (!supportedExtensions.includes(extension) && !supportedMimeTypes.includes(req.file.mimetype)) {
    await unlinkSafe(inputPath)
    return res.status(400).json({
      error: 'Unsupported file type. Please upload JPG, PNG, WEBP, or GIF.',
    })
  }

  const isGif = extension === '.gif' || req.file.mimetype === 'image/gif'

  try {
    if (isGif) {
      const baseName = `compressed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const result = await compressGifToTarget(inputPath, targetBytes, baseName)

      res.setHeader('Content-Type', 'image/gif')
      res.setHeader('Content-Disposition', `attachment; filename="compressed-${path.parse(req.file.originalname).name}.gif"`)
      res.setHeader('X-Original-Size-Bytes', String(originalSize))
      res.setHeader('X-Compressed-Size-Bytes', String(result.size))
      res.setHeader('X-Target-Bytes', String(targetBytes))
      res.setHeader('X-Target-Achieved', String(result.achieved))

      return res.sendFile(path.resolve(result.outputPath), async err => {
        await unlinkSafe(inputPath)
        await unlinkSafe(result.outputPath)
        if (err) {
          console.error('Error sending compressed GIF:', err)
        }
      })
    }

    const imageResult = await compressImageToTarget(inputPath, targetBytes)

    res.setHeader('Content-Type', imageResult.mimeType)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="compressed-${path.parse(req.file.originalname).name}.${imageResult.extension}"`
    )
    res.setHeader('X-Original-Size-Bytes', String(originalSize))
    res.setHeader('X-Compressed-Size-Bytes', String(imageResult.size))
    res.setHeader('X-Target-Bytes', String(targetBytes))
    res.setHeader('X-Target-Achieved', String(imageResult.achieved))

    await unlinkSafe(inputPath)
    return res.status(200).send(imageResult.buffer)
  } catch (error) {
    await unlinkSafe(inputPath)
    console.error('Compression error:', error)
    const details = error && error.message ? ` Details: ${error.message}` : ''
    return res.status(500).json({
      error: `Compression failed. Try a different target size or file format.${details}`,
    })
  }
})

// Video format conversion endpoint
const FORMAT_OPTIONS = {
  mp4:  { ext: 'mp4',  mime: 'video/mp4',        args: ['-c:v libx264', '-c:a aac', '-movflags +faststart', '-preset fast'] },
  mov:  { ext: 'mov',  mime: 'video/quicktime',   args: ['-c:v libx264', '-c:a aac', '-preset fast'] },
  avi:  { ext: 'avi',  mime: 'video/x-msvideo',   args: ['-c:v libx264', '-c:a mp3'] },
  mkv:  { ext: 'mkv',  mime: 'video/x-matroska',  args: ['-c:v libx264', '-c:a aac', '-preset fast'] },
  webm: { ext: 'webm', mime: 'video/webm',         args: ['-c:v libvpx-vp9', '-c:a libopus', '-b:v 0', '-crf 30'] },
  flv:  { ext: 'flv',  mime: 'video/x-flv',        args: ['-c:v libx264', '-c:a aac', '-ar 44100'] },
  wmv:  { ext: 'wmv',  mime: 'video/x-ms-wmv',     args: ['-c:v wmv2', '-c:a wmav2'] },
  m4v:  { ext: 'm4v',  mime: 'video/x-m4v',        args: ['-c:v libx264', '-c:a aac', '-movflags +faststart'] },
  ts:   { ext: 'ts',   mime: 'video/mp2t',          args: ['-c:v libx264', '-c:a aac'] },
  '3gp':{ ext: '3gp',  mime: 'video/3gpp',          args: ['-c:v libx264', '-c:a aac', '-strict experimental'] },
  mp3:  { ext: 'mp3',  mime: 'audio/mpeg',          args: ['-vn', '-c:a libmp3lame', '-q:a 2'] },
  aac:  { ext: 'aac',  mime: 'audio/aac',            args: ['-vn', '-c:a aac', '-b:a 192k'] },
  wav:  { ext: 'wav',  mime: 'audio/wav',            args: ['-vn', '-c:a pcm_s16le'] },
  ogg:  { ext: 'ogg',  mime: 'audio/ogg',            args: ['-vn', '-c:a libvorbis', '-q:a 4'] },
}

// In-memory job store for tracking conversion progress
const jobs = new Map()

function broadcastToJob(job, data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const client of job.clients) {
    try { client.write(msg) } catch {}
  }
}

// SSE endpoint — streams FFmpeg progress to the client
app.get('/api/convert-video/progress/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send current state immediately so reconnects get the latest snapshot
  res.write(`data: ${JSON.stringify({ percent: job.percent, status: job.status, error: job.error })}\n\n`)

  if (job.status === 'done' || job.status === 'error') return res.end()

  job.clients.push(res)
  req.on('close', () => { job.clients = job.clients.filter(c => c !== res) })
})

// Download endpoint — serves the finished file by jobId
app.get('/api/convert-video/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job || job.status !== 'done' || !job.outputPath) {
    return res.status(404).json({ error: 'File not ready' })
  }
  res.setHeader('Content-Type', job.mime)
  res.setHeader('Content-Disposition', `attachment; filename="${job.originalBaseName}.${job.ext}"`)
  res.sendFile(job.outputPath, err => {
    if (err) console.error('Error sending converted file:', err)
    setTimeout(() => {
      unlinkSafe(job.inputPath)
      unlinkSafe(job.outputPath)
      jobs.delete(req.params.jobId)
    }, 30000)
  })
})

// Start conversion — returns jobId immediately, runs FFmpeg in background
app.post('/api/convert-video', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' })
  }

  const { format } = req.body
  if (!format || !FORMAT_OPTIONS[format]) {
    await unlinkSafe(req.file.path)
    return res.status(400).json({ error: 'Invalid or unsupported output format' })
  }

  const inputPath = path.resolve(req.file.path)
  const { ext, mime, args } = FORMAT_OPTIONS[format]
  const timestamp = Date.now()
  const jobId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`
  const outputPath = path.join(outputsDir, `${timestamp}.${ext}`)
  const originalBaseName = path.parse(req.file.originalname).name

  const job = {
    status: 'processing', percent: 0,
    startTime: Date.now(),
    inputPath, outputPath, ext, mime, originalBaseName,
    error: null, clients: [],
  }
  jobs.set(jobId, job)

  // Respond with jobId right away so the client can open the SSE stream
  res.json({ jobId })

  // FFmpeg runs in the background
  try {
    await new Promise((resolve, reject) => {
      const flatArgs = args.flatMap(a => a.split(' '))
      ffmpeg(inputPath)
        .outputOptions([...flatArgs, '-y'])
        .output(outputPath)
        .on('start', line => console.log('Convert command:', line))
        .on('progress', progress => {
          const pct = Math.min(99, Math.round(progress.percent || 0))
          job.percent = pct
          broadcastToJob(job, { status: 'processing', percent: pct, timemark: progress.timemark })
        })
        .on('end', resolve)
        .on('error', (err, _stdout, stderr) => {
          console.error('Convert error:', err.message, stderr)
          reject(err)
        })
        .run()
    })

    if (!fs.existsSync(outputPath)) throw new Error('Output file was not created')

    job.status = 'done'
    job.percent = 100
    broadcastToJob(job, { status: 'done', percent: 100 })
    for (const c of job.clients) { try { c.end() } catch {} }
    job.clients = []
  } catch (error) {
    console.error('Video conversion error:', error)
    job.status = 'error'
    job.error = error.message || 'Conversion failed'
    broadcastToJob(job, { status: 'error', error: job.error })
    for (const c of job.clients) { try { c.end() } catch {} }
    job.clients = []
    await unlinkSafe(inputPath)
    await unlinkSafe(outputPath)
    setTimeout(() => jobs.delete(jobId), 60000)
  }
})

// Photo Collage endpoint
app.post('/api/collage', upload.array('images', 20), async (req, res) => {
  const files = req.files || []
  const inputPaths = files.map(f => f.path)

  if (files.length < 2) {
    for (const p of inputPaths) await unlinkSafe(p)
    return res.status(400).json({ error: 'Please upload at least 2 images.' })
  }

  const layout = ['grid', 'horizontal', 'vertical'].includes(req.body.layout) ? req.body.layout : 'grid'
  const cellSize = Math.max(100, Math.min(1200, parseInt(req.body.cellSize) || 400))
  const gap = Math.max(0, Math.min(100, parseInt(req.body.gap) || 10))
  const bgHex = (req.body.background || '#ffffff').replace('#', '')
  const format = ['jpg', 'png', 'webp'].includes(req.body.format) ? req.body.format : 'jpg'

  const bgR = parseInt(bgHex.slice(0, 2), 16) || 255
  const bgG = parseInt(bgHex.slice(2, 4), 16) || 255
  const bgB = parseInt(bgHex.slice(4, 6), 16) || 255

  try {
    // Resize all images and collect their actual pixel dimensions
    const resized = []
    for (const inputPath of inputPaths) {
      let pipeline = sharp(inputPath).rotate()

      if (layout === 'horizontal') {
        // Fixed height, proportional width
        pipeline = pipeline.resize(null, cellSize, { fit: 'inside', withoutEnlargement: false })
      } else if (layout === 'vertical') {
        // Fixed width, proportional height
        pipeline = pipeline.resize(cellSize, null, { fit: 'inside', withoutEnlargement: false })
      } else {
        // Grid: square crop to fill the cell
        pipeline = pipeline.resize(cellSize, cellSize, { fit: 'cover' })
      }

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
      resized.push({ data, width: info.width, height: info.height })
    }

    // Calculate canvas dimensions and positions
    let canvasWidth, canvasHeight
    const positions = []

    if (layout === 'horizontal') {
      canvasHeight = cellSize
      canvasWidth = resized.reduce((sum, img, i) => sum + img.width + (i > 0 ? gap : 0), 0)
      let x = 0
      for (const img of resized) {
        positions.push({ x, y: Math.round((canvasHeight - img.height) / 2) })
        x += img.width + gap
      }
    } else if (layout === 'vertical') {
      canvasWidth = cellSize
      canvasHeight = resized.reduce((sum, img, i) => sum + img.height + (i > 0 ? gap : 0), 0)
      let y = 0
      for (const img of resized) {
        positions.push({ x: Math.round((canvasWidth - img.width) / 2), y })
        y += img.height + gap
      }
    } else {
      // Grid: auto-calculate columns and rows
      const cols = Math.ceil(Math.sqrt(resized.length))
      canvasWidth = cols * cellSize + (cols - 1) * gap
      const rows = Math.ceil(resized.length / cols)
      canvasHeight = rows * cellSize + (rows - 1) * gap
      resized.forEach((_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        positions.push({ x: col * (cellSize + gap), y: row * (cellSize + gap) })
      })
    }

    const compositeItems = resized.map((img, i) => ({
      input: img.data,
      left: positions[i].x,
      top: positions[i].y,
    }))

    let pipeline = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: { r: bgR, g: bgG, b: bgB },
      },
    }).composite(compositeItems)

    let buffer
    if (format === 'png') {
      buffer = await pipeline.png().toBuffer()
    } else if (format === 'webp') {
      buffer = await pipeline.webp({ quality: 90 }).toBuffer()
    } else {
      buffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    }

    const mimeMap = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
    const ext = format === 'jpg' ? 'jpg' : format
    res.setHeader('Content-Type', mimeMap[format])
    res.setHeader('Content-Disposition', `attachment; filename="collage.${ext}"`)
    return res.send(buffer)
  } catch (error) {
    console.error('Collage error:', error)
    return res.status(500).json({ error: error.message || 'Failed to create collage' })
  } finally {
    for (const p of inputPaths) await unlinkSafe(p)
  }
})

app.listen(8000, () => {
  console.log('Server running at http://localhost:8000')
  console.log('Open http://localhost:8000 in your browser to use the GIF converter')
  console.log('Note: Make sure FFmpeg is installed on your system')
})

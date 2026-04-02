const express = require('express')
const path = require('path')
const os = require('os')
const sharp = require('sharp')
const multer = require('multer')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const { promisify } = require('util')

const app = express()

// All uploads held in memory — nothing written to disk by multer
const upload = multer({ storage: multer.memoryStorage() })
const unlink = promisify(fs.unlink)

const unlinkSafe = async filePath => {
  if (!filePath) return
  try {
    await unlink(filePath)
  } catch {
    // ignore cleanup errors
  }
}

// Write a buffer to a temp file (needed for FFmpeg which requires file paths)
const writeTmp = (buffer, ext) => {
  const filePath = path.join(os.tmpdir(), `vtg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

const ffprobeAsync = filePath =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) { reject(err); return }
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

const compressGifToTarget = async (inputPath, targetBytes) => {
  const probe = await ffprobeAsync(inputPath)
  const videoStream = probe.streams.find(stream => stream.codec_type === 'video')
  const sourceWidth = videoStream?.width || 800
  const scaleFactors = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]
  const fpsOptions = [15, 12, 10, 8, 6]

  let best = { path: null, size: Number.POSITIVE_INFINITY }

  for (const scaleFactor of scaleFactors) {
    const scaledWidth = Math.max(80, Math.round(sourceWidth * scaleFactor))

    for (const fps of fpsOptions) {
      const outputPath = path.join(os.tmpdir(), `vtg-gif-${scaledWidth}-${fps}-${Date.now()}.gif`)
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

const compressImageToTarget = async (inputBuffer, targetBytes) => {
  const metadata = await sharp(inputBuffer).metadata()
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
      let pipeline = sharp(inputBuffer)
        .rotate()
        .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })

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

      if (!smallestOverall || size < smallestOverall.size) smallestOverall = candidate

      if (size <= targetBytes) {
        if (!bestUnderTarget || size > bestUnderTarget.size) bestUnderTarget = candidate
        low = quality + 1
      } else {
        high = quality - 1
      }
    }
  }

  const finalResult = bestUnderTarget || smallestOverall
  const extension = finalResult.format === 'jpeg' ? 'jpg' : finalResult.format
  const mimeType = `image/${finalResult.format === 'jpg' ? 'jpeg' : finalResult.format}`

  return { buffer: finalResult.buffer, size: finalResult.size, extension, mimeType, achieved: Boolean(bestUnderTarget) }
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
  const timestamp = Date.now()

  const inputPath = writeTmp(req.file.buffer, path.extname(req.file.originalname) || '.mp4')
  const outputPath = path.join(os.tmpdir(), `vtg-out-${timestamp}.gif`)
  const palettePath = path.join(os.tmpdir(), `vtg-palette-${timestamp}.png`)

  const sizeString = heightNum > 0 ? `${widthNum}x${heightNum}` : `${widthNum}:-1`

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([`fps=${fps}`, `scale=${sizeString}:flags=lanczos`, 'palettegen=max_colors=256'])
        .outputOptions(['-y'])
        .output(palettePath)
        .on('end', resolve)
        .on('error', (err, _stdout, stderr) => {
          console.error('Palette error:', err.message, stderr)
          reject(err)
        })
        .run()
    })

    const scaleFilter = heightNum > 0
      ? `scale=${widthNum}:${heightNum}:flags=lanczos`
      : `scale=${widthNum}:-1:flags=lanczos`

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .input(palettePath)
        .complexFilter([`[0:v]fps=${fps},${scaleFilter}[x]`, '[x][1:v]paletteuse=dither=bayer:bayer_scale=5'])
        .outputOptions(['-loop 0'])
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err, _stdout, stderr) => {
          console.error('GIF error:', err.message, stderr)
          reject(err)
        })
        .run()
    })

    if (!fs.existsSync(outputPath)) throw new Error('Output file was not created')

    res.setHeader('Content-Type', 'image/gif')
    res.setHeader('Content-Disposition', 'attachment; filename="converted.gif"')
    res.sendFile(outputPath, err => {
      if (err) console.error('Error sending GIF:', err)
      setTimeout(() => {
        unlinkSafe(inputPath)
        unlinkSafe(palettePath)
        unlinkSafe(outputPath)
      }, 60000)
    })
  } catch (error) {
    console.error('Conversion error:', error)
    unlinkSafe(inputPath)
    unlinkSafe(palettePath)
    unlinkSafe(outputPath)
    res.status(500).json({ error: error.message || 'Conversion failed' })
  }
})

// Image Resize endpoint
app.post('/api/resize-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' })
  }

  const widthNum = parseInt(req.body.width)
  const heightNum = parseInt(req.body.height) || null

  try {
    const buffer = await sharp(req.file.buffer)
      .resize(widthNum, heightNum, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer()

    res.setHeader('Content-Type', req.file.mimetype)
    res.setHeader('Content-Disposition', `attachment; filename="resized-${req.file.originalname}"`)
    res.send(buffer)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Image processing failed' })
  }
})

// Compress media endpoint
app.post('/api/compress-media', upload.single('media'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' })
  }

  const originalSize = req.file.size
  const targetSizeMB = parseFloat(req.body.targetSizeMB)

  if (!targetSizeMB || targetSizeMB <= 0) {
    return res.status(400).json({ error: 'Target size must be greater than 0 MB' })
  }

  const targetBytes = Math.round(targetSizeMB * 1024 * 1024)
  const extension = path.extname(req.file.originalname).toLowerCase()
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
  const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  if (!supportedExtensions.includes(extension) && !supportedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Unsupported file type. Please upload JPG, PNG, WEBP, or GIF.' })
  }

  const isGif = extension === '.gif' || req.file.mimetype === 'image/gif'

  try {
    if (isGif) {
      // GIF needs FFmpeg — write to tmp, process, delete
      const inputPath = writeTmp(req.file.buffer, '.gif')
      let result
      try {
        result = await compressGifToTarget(inputPath, targetBytes)
      } finally {
        await unlinkSafe(inputPath)
      }

      res.setHeader('Content-Type', 'image/gif')
      res.setHeader('Content-Disposition', `attachment; filename="compressed-${path.parse(req.file.originalname).name}.gif"`)
      res.setHeader('X-Original-Size-Bytes', String(originalSize))
      res.setHeader('X-Compressed-Size-Bytes', String(result.size))
      res.setHeader('X-Target-Bytes', String(targetBytes))
      res.setHeader('X-Target-Achieved', String(result.achieved))

      return res.sendFile(path.resolve(result.outputPath), async err => {
        await unlinkSafe(result.outputPath)
        if (err) console.error('Error sending compressed GIF:', err)
      })
    }

    const imageResult = await compressImageToTarget(req.file.buffer, targetBytes)

    res.setHeader('Content-Type', imageResult.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="compressed-${path.parse(req.file.originalname).name}.${imageResult.extension}"`)
    res.setHeader('X-Original-Size-Bytes', String(originalSize))
    res.setHeader('X-Compressed-Size-Bytes', String(imageResult.size))
    res.setHeader('X-Target-Bytes', String(targetBytes))
    res.setHeader('X-Target-Achieved', String(imageResult.achieved))

    return res.status(200).send(imageResult.buffer)
  } catch (error) {
    console.error('Compression error:', error)
    const details = error?.message ? ` Details: ${error.message}` : ''
    return res.status(500).json({ error: `Compression failed. Try a different target size or file format.${details}` })
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

const jobs = new Map()

function broadcastToJob(job, data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const client of job.clients) {
    try { client.write(msg) } catch {}
  }
}

app.get('/api/convert-video/progress/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  res.write(`data: ${JSON.stringify({ percent: job.percent, status: job.status, error: job.error })}\n\n`)

  if (job.status === 'done' || job.status === 'error') return res.end()

  job.clients.push(res)
  req.on('close', () => { job.clients = job.clients.filter(c => c !== res) })
})

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

app.post('/api/convert-video', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' })
  }

  const { format } = req.body
  if (!format || !FORMAT_OPTIONS[format]) {
    return res.status(400).json({ error: 'Invalid or unsupported output format' })
  }

  const { ext, mime, args } = FORMAT_OPTIONS[format]
  const timestamp = Date.now()
  const jobId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`
  const inputPath = writeTmp(req.file.buffer, path.extname(req.file.originalname) || '.mp4')
  const outputPath = path.join(os.tmpdir(), `vtg-converted-${timestamp}.${ext}`)
  const originalBaseName = path.parse(req.file.originalname).name

  const job = {
    status: 'processing', percent: 0,
    startTime: Date.now(),
    inputPath, outputPath, ext, mime, originalBaseName,
    error: null, clients: [],
  }
  jobs.set(jobId, job)

  res.json({ jobId })

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

  if (files.length < 2) {
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
    const resized = []
    for (const file of files) {
      let pipeline = sharp(file.buffer).rotate()

      if (layout === 'horizontal') {
        pipeline = pipeline.resize(null, cellSize, { fit: 'inside', withoutEnlargement: false })
      } else if (layout === 'vertical') {
        pipeline = pipeline.resize(cellSize, null, { fit: 'inside', withoutEnlargement: false })
      } else {
        pipeline = pipeline.resize(cellSize, cellSize, { fit: 'cover' })
      }

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
      resized.push({ data, width: info.width, height: info.height })
    }

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

    const compositeItems = resized.map((img, i) => ({ input: img.data, left: positions[i].x, top: positions[i].y }))

    let pipeline = sharp({
      create: { width: canvasWidth, height: canvasHeight, channels: 3, background: { r: bgR, g: bgG, b: bgB } },
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
    res.setHeader('Content-Type', mimeMap[format])
    res.setHeader('Content-Disposition', `attachment; filename="collage.${format}"`)
    return res.send(buffer)
  } catch (error) {
    console.error('Collage error:', error)
    return res.status(500).json({ error: error.message || 'Failed to create collage' })
  }
})

// Photo Frame endpoint
app.post('/api/frame', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' })
  }

  const inputBuffer = req.file.buffer
  const style = req.body.style || 'classic'
  const border = Math.max(10, Math.min(200, parseInt(req.body.borderSize) || 60))
  const format = ['jpg', 'png', 'webp'].includes(req.body.format) ? req.body.format : 'jpg'

  try {
    const metadata = await sharp(inputBuffer).metadata()
    const imgWidth = metadata.width
    const imgHeight = metadata.height

    let buffer

    if (style === 'classic') {
      const accent = Math.max(2, Math.round(border * 0.06))
      const outerW = imgWidth + border * 2
      const outerH = imgHeight + border * 2

      const accentRect = Buffer.from(
        `<svg width="${outerW}" height="${outerH}">
          <rect x="${border - accent * 3}" y="${border - accent * 3}"
                width="${imgWidth + accent * 6}" height="${imgHeight + accent * 6}"
                fill="none" stroke="#5c4a1e" stroke-width="${accent}"/>
          <rect x="${border - accent}" y="${border - accent}"
                width="${imgWidth + accent * 2}" height="${imgHeight + accent * 2}"
                fill="none" stroke="#d4a843" stroke-width="${accent}"/>
        </svg>`
      )

      const imageBuffer = await sharp(inputBuffer).rotate().toBuffer()
      buffer = await sharp({ create: { width: outerW, height: outerH, channels: 3, background: { r: 191, g: 155, b: 81 } } })
        .composite([{ input: accentRect, left: 0, top: 0 }, { input: imageBuffer, left: border, top: border }])
        .png()
        .toBuffer()
    } else if (style === 'polaroid') {
      const bottomBorder = Math.round(border * 2.5)
      const outerW = imgWidth + border * 2
      const outerH = imgHeight + border + bottomBorder

      const imageBuffer = await sharp(inputBuffer).rotate().toBuffer()
      buffer = await sharp({ create: { width: outerW, height: outerH, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .composite([{ input: imageBuffer, left: border, top: border }])
        .png()
        .toBuffer()
    } else if (style === 'shadow') {
      const shadowOffset = Math.round(border * 0.25)
      const outerW = imgWidth + border * 2 + shadowOffset
      const outerH = imgHeight + border * 2 + shadowOffset

      const shadowSvg = Buffer.from(
        `<svg width="${outerW}" height="${outerH}">
          <rect x="${border + shadowOffset}" y="${border + shadowOffset}"
                width="${imgWidth}" height="${imgHeight}"
                rx="4" ry="4" fill="rgba(0,0,0,0.35)"/>
        </svg>`
      )

      const imageBuffer = await sharp(inputBuffer).rotate().toBuffer()
      buffer = await sharp({ create: { width: outerW, height: outerH, channels: 3, background: { r: 245, g: 245, b: 245 } } })
        .composite([{ input: shadowSvg, left: 0, top: 0 }, { input: imageBuffer, left: border, top: border }])
        .png()
        .toBuffer()
    } else if (style === 'vintage') {
      const outerBorder = Math.round(border * 0.4)
      const innerBorder = border - outerBorder
      const outerW = imgWidth + (outerBorder + innerBorder) * 2
      const outerH = imgHeight + (outerBorder + innerBorder) * 2

      const innerCanvas = await sharp({ create: { width: imgWidth + innerBorder * 2, height: imgHeight + innerBorder * 2, channels: 3, background: { r: 245, g: 235, b: 215 } } })
        .composite([{ input: await sharp(inputBuffer).rotate().toBuffer(), left: innerBorder, top: innerBorder }])
        .png()
        .toBuffer()

      buffer = await sharp({ create: { width: outerW, height: outerH, channels: 3, background: { r: 62, g: 47, b: 34 } } })
        .composite([{ input: innerCanvas, left: outerBorder, top: outerBorder }])
        .png()
        .toBuffer()
    } else if (style === 'modern') {
      const thinBorder = Math.max(2, Math.round(border * 0.08))
      const matSize = border - thinBorder
      const outerW = imgWidth + (thinBorder + matSize) * 2
      const outerH = imgHeight + (thinBorder + matSize) * 2

      const innerCanvas = await sharp({ create: { width: imgWidth + matSize * 2, height: imgHeight + matSize * 2, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .composite([{ input: await sharp(inputBuffer).rotate().toBuffer(), left: matSize, top: matSize }])
        .png()
        .toBuffer()

      buffer = await sharp({ create: { width: outerW, height: outerH, channels: 3, background: { r: 30, g: 30, b: 30 } } })
        .composite([{ input: innerCanvas, left: thinBorder, top: thinBorder }])
        .png()
        .toBuffer()
    } else {
      return res.status(400).json({ error: 'Unknown frame style' })
    }

    const mimeMap = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
    let pipeline = sharp(buffer)
    if (format === 'png') {
      pipeline = pipeline.png()
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality: 92 })
    } else {
      pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true })
    }

    const outputBuffer = await pipeline.toBuffer()
    const ext = format === 'jpg' ? 'jpg' : format

    res.setHeader('Content-Type', mimeMap[format])
    res.setHeader('Content-Disposition', `attachment; filename="framed.${ext}"`)
    return res.send(outputBuffer)
  } catch (error) {
    console.error('Frame error:', error)
    return res.status(500).json({ error: error.message || 'Failed to add frame' })
  }
})

app.listen(8000, () => {
  console.log('Server running at http://localhost:8000')
})

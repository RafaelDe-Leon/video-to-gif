const FORMAT_DESCRIPTIONS = {
  mp4:  'H.264 video + AAC audio — best for sharing & streaming',
  mov:  'H.264 video + AAC audio — Apple QuickTime format',
  avi:  'H.264 video + MP3 audio — classic Windows container',
  mkv:  'H.264 video + AAC audio — flexible high-quality container',
  webm: 'VP9 video + Opus audio — optimized for the web',
  flv:  'H.264 video + AAC audio — Flash video format',
  wmv:  'WMV2 video + WMA audio — Windows Media format',
  m4v:  'H.264 video + AAC audio — iTunes / Apple TV format',
  ts:   'H.264 video + AAC audio — MPEG transport stream',
  '3gp':'H.264 video + AAC audio — mobile / low-bandwidth format',
  mp3:  'Audio only — high-quality MP3 (128–320 kbps)',
  aac:  'Audio only — AAC at 192 kbps',
  wav:  'Audio only — uncompressed lossless PCM',
  ogg:  'Audio only — open Vorbis codec',
}

let selectedFile = null
let selectedFormat = 'mp4'

document.addEventListener('DOMContentLoaded', () => {
  const uploadArea          = document.getElementById('uploadArea')
  const fileInput           = document.getElementById('fileInput')
  const fileName            = document.getElementById('fileName')
  const fileInfo            = document.getElementById('fileInfo')
  const convertBtn          = document.getElementById('convertBtn')
  const btnText             = document.getElementById('btnText')
  const progressContainer   = document.getElementById('progressContainer')
  const progressFill        = document.getElementById('progressFill')
  const statusText          = document.getElementById('statusText')
  const timeRemaining       = document.getElementById('timeRemaining')
  const resultContainer     = document.getElementById('resultContainer')
  const downloadBtn         = document.getElementById('downloadBtn')
  const downloadLabel       = document.getElementById('downloadLabel')
  const warning             = document.getElementById('warning')
  const formatBtns          = document.querySelectorAll('.format-btn')
  const selectedFormatBadge = document.getElementById('selectedFormatBadge')
  const selectedFormatDescription = document.getElementById('selectedFormatDescription')

  // ── Format selection ──────────────────────────────────────────────────────
  formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      formatBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedFormat = btn.dataset.format
      selectedFormatBadge.textContent = selectedFormat.toUpperCase()
      selectedFormatDescription.textContent = FORMAT_DESCRIPTIONS[selectedFormat] || ''
      updateConvertButton()
    })
  })

  // ── Drag & drop ────────────────────────────────────────────────────────────
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault()
    uploadArea.classList.add('dragover')
  })

  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'))

  uploadArea.addEventListener('drop', e => {
    e.preventDefault()
    uploadArea.classList.remove('dragover')
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  })

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0])
  })

  // ── File handling ──────────────────────────────────────────────────────────
  function handleFile(file) {
    selectedFile = file
    uploadArea.classList.add('has-file')
    fileName.textContent = file.name
    fileInfo.textContent = `${formatBytes(file.size)} · ${file.type || 'video/unknown'}`
    hideWarning()
    hideResult()
    updateConvertButton()
  }

  function updateConvertButton() {
    if (selectedFile) {
      convertBtn.disabled = false
      btnText.textContent = `Convert to ${selectedFormat.toUpperCase()}`
    } else {
      convertBtn.disabled = true
      btnText.textContent = 'Select a video file to convert'
    }
  }

  // ── Conversion ─────────────────────────────────────────────────────────────
  convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return

    hideWarning()
    hideResult()
    showProgress()
    convertBtn.disabled = true
    btnText.innerHTML = '<span class="spinner"></span> Uploading…'
    statusText.textContent = 'Uploading file…'
    timeRemaining.textContent = ''
    progressFill.style.width = '0%'

    const formData = new FormData()
    formData.append('video', selectedFile)
    formData.append('format', selectedFormat)

    let conversionStartTime = null

    try {
      // POST starts the job and returns a jobId immediately
      const res = await fetch('/api/convert-video', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start conversion' }))
        throw new Error(err.error)
      }

      const { jobId } = await res.json()
      btnText.innerHTML = '<span class="spinner"></span> Converting…'

      // Open SSE stream to receive real FFmpeg progress
      await new Promise((resolve, reject) => {
        const source = new EventSource(`/api/convert-video/progress/${jobId}`)

        source.onmessage = e => {
          const data = JSON.parse(e.data)

          if (data.status === 'processing') {
            if (!conversionStartTime && data.percent > 0) {
              conversionStartTime = Date.now()
            }
            progressFill.style.width = data.percent + '%'
            statusText.textContent = `Converting… ${data.percent}%`
            timeRemaining.textContent = formatTimeRemaining(conversionStartTime, data.percent)
          }

          if (data.status === 'done') {
            source.close()
            progressFill.style.width = '100%'
            statusText.textContent = 'Finalizing…'
            timeRemaining.textContent = ''
            resolve()
          }

          if (data.status === 'error') {
            source.close()
            reject(new Error(data.error || 'Conversion failed'))
          }
        }

        source.onerror = () => {
          source.close()
          reject(new Error('Lost connection to server during conversion'))
        }
      })

      const originalBase = selectedFile.name.replace(/\.[^.]+$/, '')
      const outName = `${originalBase}.${selectedFormat}`
      downloadBtn.href = `/api/convert-video/download/${jobId}`
      downloadBtn.download = outName
      downloadLabel.textContent = outName

      hideProgress()
      showResult()
    } catch (err) {
      hideProgress()
      showWarning(err.message || 'An unexpected error occurred.')
    } finally {
      convertBtn.disabled = false
      btnText.textContent = `Convert to ${selectedFormat.toUpperCase()}`
    }
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showProgress() {
    progressFill.style.width = '0%'
    progressContainer.classList.add('active')
  }

  function hideProgress() {
    progressContainer.classList.remove('active')
  }

  function showResult() {
    resultContainer.classList.add('active')
  }

  function hideResult() {
    resultContainer.classList.remove('active')
  }

  function showWarning(msg) {
    warning.textContent = msg
    warning.classList.add('active')
  }

  function hideWarning() {
    warning.classList.remove('active')
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  function formatTimeRemaining(startTime, percent) {
    if (!startTime || percent <= 0) return ''
    const elapsed = Date.now() - startTime
    const estimated = elapsed / (percent / 100)
    const remaining = Math.round((estimated - elapsed) / 1000)
    if (remaining <= 0) return ''
    if (remaining < 60) return `~${remaining}s remaining`
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    return `~${m}m ${s}s remaining`
  }
})

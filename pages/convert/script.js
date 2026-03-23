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
let objectUrl = null

document.addEventListener('DOMContentLoaded', () => {
  const uploadArea    = document.getElementById('uploadArea')
  const fileInput     = document.getElementById('fileInput')
  const fileName      = document.getElementById('fileName')
  const fileInfo      = document.getElementById('fileInfo')
  const convertBtn    = document.getElementById('convertBtn')
  const btnText       = document.getElementById('btnText')
  const progressContainer = document.getElementById('progressContainer')
  const progressFill  = document.getElementById('progressFill')
  const statusText    = document.getElementById('statusText')
  const resultContainer = document.getElementById('resultContainer')
  const downloadBtn   = document.getElementById('downloadBtn')
  const downloadLabel = document.getElementById('downloadLabel')
  const warning       = document.getElementById('warning')
  const formatBtns    = document.querySelectorAll('.format-btn')
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
    btnText.innerHTML = '<span class="spinner"></span> Converting…'

    // Animate progress bar (indeterminate style)
    let pct = 0
    const ticker = setInterval(() => {
      pct = pct < 85 ? pct + (85 - pct) * 0.04 : pct
      progressFill.style.width = pct + '%'
    }, 300)

    const formData = new FormData()
    formData.append('video', selectedFile)
    formData.append('format', selectedFormat)

    try {
      statusText.textContent = 'Uploading and converting…'
      const response = await fetch('/api/convert-video', { method: 'POST', body: formData })

      clearInterval(ticker)
      progressFill.style.width = '100%'

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Conversion failed' }))
        throw new Error(err.error || 'Conversion failed')
      }

      const blob = await response.blob()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = URL.createObjectURL(blob)

      const originalBase = selectedFile.name.replace(/\.[^.]+$/, '')
      const outName = `${originalBase}.${selectedFormat}`

      downloadBtn.href = objectUrl
      downloadBtn.download = outName
      downloadLabel.textContent = outName

      hideProgress()
      showResult()
    } catch (err) {
      clearInterval(ticker)
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
})

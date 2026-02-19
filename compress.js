const fileInput = document.getElementById('fileInput')
const uploadArea = document.getElementById('uploadArea')
const fileName = document.getElementById('fileName')
const fileInfo = document.getElementById('fileInfo')
const targetSizeInput = document.getElementById('targetSizeInput')
const compressBtn = document.getElementById('compressBtn')
const btnText = document.getElementById('btnText')
const warning = document.getElementById('warning')
const progressContainer = document.getElementById('progressContainer')
const progressFill = document.getElementById('progressFill')
const statusText = document.getElementById('statusText')
const resultContainer = document.getElementById('resultContainer')
const resultImage = document.getElementById('resultImage')
const resultStats = document.getElementById('resultStats')
const downloadBtn = document.getElementById('downloadBtn')

let selectedFile = null

const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif']
const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const isSupportedImageFile = file => {
  if (!file) return false

  if (supportedMimeTypes.includes((file.type || '').toLowerCase())) {
    return true
  }

  const extension = (file.name.split('.').pop() || '').toLowerCase()
  return supportedExtensions.includes(extension)
}

const formatMB = bytes => `${(bytes / (1024 * 1024)).toFixed(2)} MB`

const showError = message => {
  warning.classList.add('active')
  warning.innerHTML = `<strong>⚠️ Error:</strong> ${message}`
}

const clearError = () => {
  warning.classList.remove('active')
  warning.innerHTML = ''
}

const updateProgress = percent => {
  progressFill.style.width = `${percent}%`
}

const handleFile = file => {
  if (!isSupportedImageFile(file)) {
    showError('Only JPG, PNG, WEBP, or GIF files are supported.')
    return
  }

  selectedFile = file
  fileName.textContent = file.name
  fileInfo.textContent = `${formatMB(file.size)} • ${file.type}`
  uploadArea.classList.add('has-file')
  resultContainer.classList.remove('active')
  compressBtn.disabled = false
  btnText.textContent = 'Compress File'
  clearError()
}

fileInput.addEventListener('change', e => {
  handleFile(e.target.files[0])
})

uploadArea.addEventListener('click', e => {
  if (e.target !== fileInput) {
    fileInput.click()
  }
})

uploadArea.addEventListener('dragover', e => {
  e.preventDefault()
  uploadArea.classList.add('dragover')
})

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover')
})

uploadArea.addEventListener('drop', e => {
  e.preventDefault()
  uploadArea.classList.remove('dragover')
  const file = e.dataTransfer.files[0]
  if (isSupportedImageFile(file)) {
    fileInput.files = e.dataTransfer.files
    handleFile(file)
  } else {
    showError('Only JPG, PNG, WEBP, or GIF files are supported.')
  }
})

compressBtn.addEventListener('click', async () => {
  if (!selectedFile) {
    showError('Please upload an image or GIF first.')
    return
  }

  const targetSizeMB = parseFloat(targetSizeInput.value)
  if (!targetSizeMB || targetSizeMB <= 0) {
    showError('Target size must be greater than 0 MB.')
    return
  }

  clearError()
  compressBtn.disabled = true
  btnText.innerHTML = '<span class="spinner"></span> Compressing...'
  progressContainer.classList.add('active')
  resultContainer.classList.remove('active')
  statusText.textContent = 'Uploading file...'
  updateProgress(20)

  const formData = new FormData()
  formData.append('media', selectedFile)
  formData.append('targetSizeMB', String(targetSizeMB))

  try {
    statusText.textContent = 'Compressing to your target size...'
    updateProgress(65)

    const response = await fetch('/api/compress-media', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Compression failed')
    }

    const blob = await response.blob()
    const downloadUrl = URL.createObjectURL(blob)

    const originalBytes = Number(response.headers.get('X-Original-Size-Bytes') || selectedFile.size)
    const compressedBytes = Number(response.headers.get('X-Compressed-Size-Bytes') || blob.size)
    const targetBytes = Number(response.headers.get('X-Target-Bytes') || targetSizeMB * 1024 * 1024)
    const targetAchieved = response.headers.get('X-Target-Achieved') === 'true'

    const outputName = `compressed-${selectedFile.name.replace(/\.[^/.]+$/, '')}`
    const extensionFromType = blob.type.split('/')[1] || 'bin'
    downloadBtn.href = downloadUrl
    downloadBtn.download = `${outputName}.${extensionFromType}`

    resultImage.src = downloadUrl
    resultStats.innerHTML = `
      <strong>Original:</strong> ${formatMB(originalBytes)}<br>
      <strong>Compressed:</strong> ${formatMB(compressedBytes)}<br>
      <strong>Target:</strong> ${formatMB(targetBytes)}<br>
      <strong>Status:</strong> ${targetAchieved ? '✅ Target reached' : 'ℹ️ Closest possible result generated'}
    `

    updateProgress(100)
    statusText.textContent = '✅ Compression complete'
    resultContainer.classList.add('active')
    btnText.textContent = 'Compress Again'
  } catch (error) {
    updateProgress(0)
    statusText.textContent = '❌ Compression failed'
    btnText.textContent = 'Retry Compression'
    showError(error.message || 'Compression failed')
  } finally {
    compressBtn.disabled = false
  }
})

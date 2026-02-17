// DOM elements
const fileInput = document.getElementById('fileInput')
const uploadArea = document.getElementById('uploadArea')
const fileName = document.getElementById('fileName')
const fileInfo = document.getElementById('fileInfo')
const convertBtn = document.getElementById('convertBtn')
const btnText = document.getElementById('btnText')
const fpsSlider = document.getElementById('fpsSlider')
const fpsValue = document.getElementById('fpsValue')
const widthInput = document.getElementById('widthInput')
const heightInput = document.getElementById('heightInput')
const lockAspect = document.getElementById('lockAspect')
const presetButtons = document.querySelectorAll('.preset-btn')

// Store video dimensions and aspect ratio
let videoWidth = 0
let videoHeight = 0
let aspectRatio = 0
const progressContainer = document.getElementById('progressContainer')
const progressFill = document.getElementById('progressFill')
const statusText = document.getElementById('statusText')
const resultContainer = document.getElementById('resultContainer')
const resultImage = document.getElementById('resultImage')
const downloadBtn = document.getElementById('downloadBtn')
const warning = document.getElementById('warning')

// File input handler
fileInput.addEventListener('change', e => {
  handleFile(e.target.files[0])
})

// Drag and drop handlers
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
  if (file && file.type.startsWith('video/')) {
    fileInput.files = e.dataTransfer.files
    handleFile(file)
  }
})

// Get video dimensions
const getVideoDimensions = file => {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src)
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }

    video.onerror = () => {
      resolve({ width: 0, height: 0 })
    }

    video.src = URL.createObjectURL(file)
  })
}

// Handle file selection
const handleFile = async file => {
  if (!file) return

  fileName.textContent = file.name
  const fileSize = (file.size / (1024 * 1024)).toFixed(2)

  // Get video dimensions
  const dimensions = await getVideoDimensions(file)
  videoWidth = dimensions.width
  videoHeight = dimensions.height

  if (videoWidth > 0 && videoHeight > 0) {
    aspectRatio = videoWidth / videoHeight
    fileInfo.textContent = `${fileSize} MB • ${videoWidth}x${videoHeight} • ${file.type}`

    // Set initial width maintaining aspect ratio
    const currentWidth = parseInt(widthInput.value) || 480
    const calculatedHeight = Math.round(currentWidth / aspectRatio)
    heightInput.value = calculatedHeight
  } else {
    fileInfo.textContent = `${fileSize} MB • ${file.type}`
  }

  uploadArea.classList.add('has-file')
  resultContainer.classList.remove('active')
  convertBtn.disabled = false
  btnText.textContent = 'Convert to GIF'
}

// FPS slider handler
fpsSlider.addEventListener('input', e => {
  fpsValue.textContent = `${e.target.value} FPS`
})

// Update height based on width (maintain aspect ratio)
const updateHeightFromWidth = () => {
  if (lockAspect.checked && aspectRatio > 0) {
    const width = parseInt(widthInput.value) || 480
    const calculatedHeight = Math.round(width / aspectRatio)
    heightInput.value = calculatedHeight
  }
}

// Update width based on height (maintain aspect ratio)
const updateWidthFromHeight = () => {
  if (lockAspect.checked && aspectRatio > 0) {
    const height = parseInt(heightInput.value) || 0
    if (height > 0) {
      const calculatedWidth = Math.round(height * aspectRatio)
      widthInput.value = calculatedWidth
      // Update active preset if it matches
      updateActivePreset(calculatedWidth)
    }
  }
}

// Update active preset button
const updateActivePreset = width => {
  presetButtons.forEach(b => {
    if (parseInt(b.dataset.width) === width) {
      b.classList.add('active')
    } else {
      b.classList.remove('active')
    }
  })
}

// Width input handler
widthInput.addEventListener('input', () => {
  updateHeightFromWidth()
  const width = parseInt(widthInput.value) || 480
  updateActivePreset(width)
})

// Height input handler
heightInput.addEventListener('input', () => {
  updateWidthFromHeight()
})

// Lock aspect ratio toggle
lockAspect.addEventListener('change', () => {
  if (lockAspect.checked && aspectRatio > 0) {
    updateHeightFromWidth()
  }
})

// Width preset buttons
presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const width = btn.dataset.width
    widthInput.value = width
    presetButtons.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    updateHeightFromWidth()
  })
})

// Set initial active preset
document.querySelector('[data-width="480"]').classList.add('active')

// Update progress
const updateProgress = percent => {
  progressFill.style.width = `${percent}%`
}

// Convert function
const convert = async () => {
  const file = fileInput.files[0]
  if (!file) {
    alert('Please select a video file first')
    return
  }

  // UI updates
  convertBtn.disabled = true
  btnText.innerHTML = '<span class="spinner"></span> Processing...'
  progressContainer.classList.add('active')
  resultContainer.classList.remove('active')
  updateProgress(10)
  statusText.textContent = 'Uploading video...'

  const fps = fpsSlider.value
  const width = parseInt(widthInput.value) || 480
  const height = parseInt(heightInput.value) || 0
  const maintainAspect = lockAspect.checked

  try {
    // Create form data
    const formData = new FormData()
    formData.append('video', file)
    formData.append('fps', fps)
    formData.append('width', width)
    formData.append('height', maintainAspect ? 0 : height) // Send 0 if aspect locked

    updateProgress(30)
    statusText.textContent = 'Converting video to GIF (this may take a few minutes)...'

    // Send to server
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Conversion failed')
    }

    updateProgress(90)
    statusText.textContent = 'Finalizing...'

    // Get the GIF blob
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)

    // Show result
    resultImage.src = url
    downloadBtn.href = url
    downloadBtn.download = file.name.replace(/\.[^/.]+$/, '') + '.gif'
    resultContainer.classList.add('active')
    updateProgress(100)
    statusText.textContent = '✅ Conversion complete!'
    btnText.textContent = 'Convert Another'
  } catch (error) {
    console.error('Conversion error:', error)
    statusText.textContent = `❌ Error: ${error.message || 'Conversion failed'}`
    btnText.textContent = 'Retry'
    updateProgress(0)
    warning.classList.add('active')
    warning.innerHTML = `<strong>⚠️ Error:</strong> ${error.message || 'Conversion failed. Make sure FFmpeg is installed on your system.'}`
  } finally {
    convertBtn.disabled = false
  }
}

// Event listeners
convertBtn.addEventListener('click', convert)

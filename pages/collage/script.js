const fileInput = document.getElementById('fileInput')
const uploadArea = document.getElementById('uploadArea')
const fileName = document.getElementById('fileName')
const warning = document.getElementById('warning')
const thumbSection = document.getElementById('thumbSection')
const imageGrid = document.getElementById('imageGrid')
const countBadge = document.getElementById('countBadge')
const clearAllBtn = document.getElementById('clearAllBtn')
const controls = document.getElementById('controls')
const cellSizeInput = document.getElementById('cellSizeInput')
const gapInput = document.getElementById('gapInput')
const bgColorInput = document.getElementById('bgColorInput')
const bgColorLabel = document.getElementById('bgColorLabel')
const formatSelect = document.getElementById('formatSelect')
const createBtn = document.getElementById('createBtn')
const btnText = document.getElementById('btnText')
const progressContainer = document.getElementById('progressContainer')
const progressFill = document.getElementById('progressFill')
const statusText = document.getElementById('statusText')
const resultContainer = document.getElementById('resultContainer')
const resultImage = document.getElementById('resultImage')
const resultStats = document.getElementById('resultStats')
const downloadBtn = document.getElementById('downloadBtn')

// Each entry: { file, objectUrl }
let selectedImages = []
let selectedLayout = 'grid'

const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif']

const isImageFile = file => {
  if (supportedMimeTypes.includes((file.type || '').toLowerCase())) return true
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return supportedExtensions.includes(ext)
}

const formatBytes = bytes => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const showError = msg => {
  warning.classList.add('active')
  warning.innerHTML = `<strong>⚠️ Error:</strong> ${msg}`
}

const clearError = () => {
  warning.classList.remove('active')
  warning.innerHTML = ''
}

const updateProgress = pct => {
  progressFill.style.width = `${pct}%`
}

const renderThumbs = () => {
  imageGrid.innerHTML = ''
  selectedImages.forEach(({ objectUrl }, i) => {
    const thumb = document.createElement('div')
    thumb.className = 'image-thumb'

    const img = document.createElement('img')
    img.src = objectUrl
    img.alt = `Photo ${i + 1}`

    const removeBtn = document.createElement('button')
    removeBtn.className = 'remove-btn'
    removeBtn.textContent = '×'
    removeBtn.title = 'Remove'
    removeBtn.addEventListener('click', () => removeImage(i))

    const indexLabel = document.createElement('span')
    indexLabel.className = 'thumb-index'
    indexLabel.textContent = `#${i + 1}`

    thumb.appendChild(img)
    thumb.appendChild(removeBtn)
    thumb.appendChild(indexLabel)
    imageGrid.appendChild(thumb)
  })

  // Add more button
  const addBtn = document.createElement('button')
  addBtn.className = 'add-more-btn'
  addBtn.title = 'Add more photos'
  addBtn.textContent = '+'
  addBtn.addEventListener('click', () => fileInput.click())
  imageGrid.appendChild(addBtn)
}

const updateUI = () => {
  const n = selectedImages.length
  countBadge.textContent = String(n)

  if (n === 0) {
    thumbSection.style.display = 'none'
    controls.style.display = 'none'
    uploadArea.classList.remove('has-files')
    fileName.textContent = 'Choose 2 or more photos'
    createBtn.disabled = true
    btnText.textContent = 'Select at least 2 photos'
  } else {
    thumbSection.style.display = 'block'
    controls.style.display = 'block'
    uploadArea.classList.add('has-files')
    fileName.textContent = `${n} photo${n !== 1 ? 's' : ''} selected`
    renderThumbs()

    if (n >= 2) {
      createBtn.disabled = false
      btnText.textContent = `Create Collage (${n} photos)`
    } else {
      createBtn.disabled = true
      btnText.textContent = 'Add at least 1 more photo'
    }
  }
}

const addImages = files => {
  let added = 0
  for (const file of files) {
    if (selectedImages.length >= 20) {
      showError('Maximum 20 images allowed.')
      break
    }
    if (!isImageFile(file)) {
      showError(`"${file.name}" is not a supported image file.`)
      continue
    }
    selectedImages.push({ file, objectUrl: URL.createObjectURL(file) })
    added++
  }
  if (added > 0) clearError()
  updateUI()
}

const removeImage = index => {
  URL.revokeObjectURL(selectedImages[index].objectUrl)
  selectedImages.splice(index, 1)
  updateUI()
}

const clearAll = () => {
  selectedImages.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl))
  selectedImages = []
  updateUI()
  resultContainer.classList.remove('active')
}

// File input change
fileInput.addEventListener('change', e => {
  addImages(Array.from(e.target.files))
  fileInput.value = ''
})

// Upload area click
uploadArea.addEventListener('click', e => {
  if (e.target !== fileInput) fileInput.click()
})

// Drag and drop
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
  addImages(Array.from(e.dataTransfer.files))
})

// Clear all
clearAllBtn.addEventListener('click', clearAll)

// Layout selection
document.querySelectorAll('.layout-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.layout-option').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    selectedLayout = btn.dataset.layout
  })
})

// Background color label sync
bgColorInput.addEventListener('input', () => {
  bgColorLabel.textContent = bgColorInput.value
})

// Create collage
createBtn.addEventListener('click', async () => {
  if (selectedImages.length < 2) {
    showError('Please select at least 2 photos.')
    return
  }

  const cellSize = parseInt(cellSizeInput.value)
  const gap = parseInt(gapInput.value)

  if (!cellSize || cellSize < 100 || cellSize > 1200) {
    showError('Cell size must be between 100 and 1200 px.')
    return
  }
  if (gap < 0 || gap > 100) {
    showError('Gap must be between 0 and 100 px.')
    return
  }

  clearError()
  createBtn.disabled = true
  btnText.innerHTML = '<span class="spinner"></span> Creating...'
  progressContainer.classList.add('active')
  resultContainer.classList.remove('active')
  statusText.textContent = 'Uploading photos...'
  updateProgress(15)

  const formData = new FormData()
  selectedImages.forEach(({ file }) => formData.append('images', file))
  formData.append('layout', selectedLayout)
  formData.append('cellSize', String(cellSize))
  formData.append('gap', String(gap))
  formData.append('background', bgColorInput.value)
  formData.append('format', formatSelect.value)

  try {
    statusText.textContent = 'Building collage...'
    updateProgress(55)

    const response = await fetch('/api/collage', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Collage creation failed')
    }

    updateProgress(90)
    statusText.textContent = 'Finalizing...'

    const blob = await response.blob()
    const downloadUrl = URL.createObjectURL(blob)

    const collageSize = blob.size
    const fmt = formatSelect.value
    const ext = fmt === 'jpg' ? 'jpg' : fmt

    downloadBtn.href = downloadUrl
    downloadBtn.download = `collage.${ext}`
    resultImage.src = downloadUrl

    const photoCount = selectedImages.length
    resultStats.innerHTML = `
      <strong>Photos combined:</strong> ${photoCount}<br>
      <strong>Layout:</strong> ${selectedLayout}<br>
      <strong>File size:</strong> ${formatBytes(collageSize)}<br>
      <strong>Format:</strong> ${fmt.toUpperCase()}
    `

    updateProgress(100)
    statusText.textContent = '✅ Collage created'
    resultContainer.classList.add('active')
    btnText.textContent = 'Create Again'
  } catch (error) {
    updateProgress(0)
    statusText.textContent = '❌ Failed to create collage'
    btnText.textContent = 'Retry'
    showError(error.message || 'Collage creation failed')
  } finally {
    createBtn.disabled = false
  }
})

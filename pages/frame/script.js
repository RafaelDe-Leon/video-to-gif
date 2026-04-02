const fileInput = document.getElementById('fileInput')
const uploadArea = document.getElementById('uploadArea')
const fileName = document.getElementById('fileName')
const frameBtn = document.getElementById('frameBtn')
const warning = document.getElementById('warning')
const borderSize = document.getElementById('borderSize')
const borderSizeValue = document.getElementById('borderSizeValue')
const outputFormat = document.getElementById('outputFormat')
const progressContainer = document.getElementById('progressContainer')
const statusText = document.getElementById('statusText')
const resultContainer = document.getElementById('resultContainer')
const previewImage = document.getElementById('previewImage')

let selectedFrame = 'classic'

// Frame style buttons
document.getElementById('frameButtons').addEventListener('click', e => {
  const btn = e.target.closest('.format-btn')
  if (!btn) return
  document.querySelectorAll('#frameButtons .format-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  selectedFrame = btn.dataset.frame
})

// Border size slider
borderSize.addEventListener('input', () => {
  borderSizeValue.textContent = borderSize.value + 'px'
})

// File handling
const handleFile = file => {
  if (!file) return
  warning.style.display = 'none'
  fileName.textContent = file.name
  uploadArea.classList.add('has-file')
  frameBtn.disabled = false
  resultContainer.classList.remove('active')
}

fileInput.addEventListener('change', e => handleFile(e.target.files[0]))

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
  if (file && file.type.startsWith('image/')) {
    fileInput.files = e.dataTransfer.files
    handleFile(file)
  }
})

function showError(msg) {
  warning.style.display = 'block'
  warning.innerHTML = `<strong>⚠️ ${msg}</strong>`
}

// Submit
frameBtn.addEventListener('click', async () => {
  const file = fileInput.files[0]
  if (!file) return

  const formData = new FormData()
  formData.append('image', file)
  formData.append('style', selectedFrame)
  formData.append('borderSize', borderSize.value)
  formData.append('format', outputFormat.value)

  frameBtn.disabled = true
  frameBtn.textContent = 'Processing...'
  progressContainer.classList.add('active')
  statusText.textContent = 'Adding frame...'
  resultContainer.classList.remove('active')
  warning.style.display = 'none'

  try {
    const response = await fetch('/api/frame', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Frame processing failed')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)

    // Show preview
    previewImage.src = url
    resultContainer.classList.add('active')

    // Auto-download
    const a = document.createElement('a')
    a.href = url
    const ext = outputFormat.value === 'jpg' ? 'jpg' : outputFormat.value
    a.download = `framed-${file.name.replace(/\.[^.]+$/, '')}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (err) {
    showError(err.message || 'Server error occurred.')
  } finally {
    frameBtn.disabled = false
    frameBtn.textContent = 'Add Frame & Download'
    progressContainer.classList.remove('active')
  }
})

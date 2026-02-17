const fileInput = document.getElementById('fileInput')
const uploadArea = document.getElementById('uploadArea')
const fileName = document.getElementById('fileName')
const resizeBtn = document.getElementById('resizeBtn')
const warning = document.getElementById('warning')
const widthInput = document.getElementById('widthInput')
const heightInput = document.getElementById('heightInput')
const lockAspect = document.getElementById('lockAspect')

let originalWidth = null
let originalHeight = null
let isSyncing = false

const handleFile = file => {
  if (!file) return

  warning.style.display = 'none'
  warning.innerHTML = ''
  resizeBtn.disabled = true

  const img = new Image()
  img.src = URL.createObjectURL(file)
  img.onload = () => {
    originalWidth = img.width
    originalHeight = img.height
    widthInput.value = img.width
    heightInput.value = img.height
    resizeBtn.disabled = false
    fileName.textContent = file.name
    uploadArea.classList.add('has-file')
  }
}

fileInput.addEventListener('change', e => {
  handleFile(e.target.files[0])
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
  if (file && file.type.startsWith('image/')) {
    fileInput.files = e.dataTransfer.files
    handleFile(file)
  }
})

function showError(msg) {
  warning.style.display = 'block'
  warning.innerHTML = `<strong>⚠️ ${msg}</strong>`
}

function syncHeightFromWidth() {
  if (!lockAspect.checked || !originalWidth || !originalHeight) return
  const widthVal = parseInt(widthInput.value, 10)
  if (!widthVal) return
  heightInput.value = Math.max(1, Math.round((widthVal * originalHeight) / originalWidth))
}

function syncWidthFromHeight() {
  if (!lockAspect.checked || !originalWidth || !originalHeight) return
  const heightVal = parseInt(heightInput.value, 10)
  if (!heightVal) return
  widthInput.value = Math.max(1, Math.round((heightVal * originalWidth) / originalHeight))
}

widthInput.addEventListener('input', () => {
  if (isSyncing) return
  isSyncing = true
  syncHeightFromWidth()
  isSyncing = false
})

heightInput.addEventListener('input', () => {
  if (isSyncing) return
  isSyncing = true
  syncWidthFromHeight()
  isSyncing = false
})

resizeBtn.addEventListener('click', async () => {
  const formData = new FormData()
  formData.append('image', fileInput.files[0])
  formData.append('width', widthInput.value)
  formData.append('height', heightInput.value)

  resizeBtn.textContent = 'Processing...'

  try {
    const response = await fetch('/api/resize-image', {
      method: 'POST',
      body: formData,
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'resized_image.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  } catch (err) {
    showError('Server error occurred.')
  } finally {
    resizeBtn.textContent = 'Resize & Download'
  }
})

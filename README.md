# Media Tools (Video to GIF + Image Tools)

Local web app for:

- converting videos to GIF,
- resizing images,
- compressing images/GIFs to a target file size.

Everything runs through your local Node.js server.

## Features

- 🎬 Video to GIF conversion with FPS and size controls
- 🖼️ Image resizing with optional aspect-ratio lock
- 🗜️ Image/GIF compression to a user-defined target size (MB)
- 📁 Drag-and-drop + click upload across pages
- 📱 Responsive UI with page navigation between tools

## Pages

- `http://localhost:8000/` or `http://localhost:8000/gif.html` → Video to GIF
- `http://localhost:8000/resize.html` → Image Resizer
- `http://localhost:8000/compress.html` → Image/GIF Compressor

## Requirements

### 1) Node.js

Node.js 14+ is required.

```bash
node --version
```

### 2) FFmpeg

FFmpeg is required for video/GIF processing.

```bash
ffmpeg -version
```

If FFmpeg is missing:

- macOS: `brew install ffmpeg`
- Linux (Ubuntu/Debian): `sudo apt update && sudo apt install ffmpeg`
- Windows: install from ffmpeg.org and add `bin` to PATH (or use `choco install ffmpeg`)

## Installation

```bash
cd /path/to/video_to_gif
npm install
```

Installed dependencies include:

- `express`
- `multer`
- `fluent-ffmpeg`
- `sharp`

## Run

```bash
node server.js
```

Then open:

- `http://localhost:8000`

## How to Use

### Video to GIF

1. Upload a video (`video/*`)
2. Adjust FPS (5–30), width, and optional height
3. Keep aspect lock on for automatic height
4. Click **Convert to GIF**
5. Download result

### Image Resizer

Supported input: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`

1. Upload image
2. Set width/height
3. Toggle aspect lock as needed
4. Click **Resize & Download**

### Image/GIF Compressor

Supported input: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`

1. Upload image or GIF
2. Set target size in MB (example: `10`)
3. Click **Compress File**
4. Download compressed output

Notes:

- If exact target size is not achievable, the app returns the closest practical result.
- Compression response includes original/compressed sizes and target-achieved status.

## API Endpoints

- `POST /api/convert` (multipart field: `video`)
- `POST /api/resize-image` (multipart field: `image`)
- `POST /api/compress-media` (multipart field: `media`, body: `targetSizeMB`)

## Project Structure

```text
video_to_gif/
├── server.js
├── gif.html
├── script.js
├── resize.html
├── resize.js
├── compress.html
├── compress.js
├── style.css
├── package.json
├── uploads/
└── outputs/
```

## Troubleshooting

### Compression fails

- Ensure file type is supported: JPG/PNG/WEBP/GIF
- Try a less aggressive target size
- Restart server to ensure latest code is running
- Check terminal logs for detailed error message

### Video conversion fails

- Confirm FFmpeg is installed and available in PATH
- Test with a shorter/smaller video file

### Port 8000 already in use

- Stop the process using port 8000, or
- change `app.listen(8000, ...)` in `server.js`

## Tech Stack

- Node.js + Express
- Multer (uploads)
- FFmpeg via `fluent-ffmpeg`
- Sharp (image processing)
- Vanilla JS + CSS frontend

## License

MIT

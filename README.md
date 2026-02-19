# Video to GIF Converter

A simple, local video-to-GIF converter that runs on your server using Node.js and FFmpeg. Convert videos to high-quality GIFs with customizable frame rate and dimensions while maintaining aspect ratio.

## Features

- 🎬 Convert videos to high-quality GIFs
- 🗜️ Compress images and GIFs to a target file size (MB)
- ⚡ Server-side processing (no browser limitations)
- 🎨 Modern, clean UI
- 📱 Responsive design
- ⚙️ Customizable FPS (5-30) and dimensions
- 🔒 Automatic aspect ratio preservation
- 🎯 High-quality encoding with Lanczos scaling and Bayer dithering

## Requirements

### 1. Node.js

You need Node.js version 14 or higher installed on your system.

**Check if you have Node.js:**
```bash
node --version
```

**If not installed:**

- **macOS**: Download from [nodejs.org](https://nodejs.org/) or use Homebrew:
  ```bash
  brew install node
  ```

- **Linux (Ubuntu/Debian)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

- **Windows**: Download the installer from [nodejs.org](https://nodejs.org/)

### 2. FFmpeg

FFmpeg is required for video processing. It must be installed on your system and accessible from the command line.

**Check if you have FFmpeg:**
```bash
ffmpeg -version
```

**If not installed:**

- **macOS** (using Homebrew):
  ```bash
  brew install ffmpeg
  ```

- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt update
  sudo apt install ffmpeg
  ```

- **Windows**:
  1. Download from [ffmpeg.org](https://ffmpeg.org/download.html)
  2. Extract the zip file
  3. Add the `bin` folder to your system PATH
  4. Or use Chocolatey:
     ```bash
     choco install ffmpeg
     ```

## Installation

1. **Navigate to the project directory:**
   ```bash
   cd /path/to/sandbox
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

   This will install:
   - `express` - Web server
   - `multer` - File upload handling
   - `fluent-ffmpeg` - FFmpeg wrapper for Node.js

## Usage

### Starting the Server

1. **Start the server:**
   ```bash
   node server.js
   ```

2. **You should see:**
   ```
   Server running at http://localhost:8000
   Open http://localhost:8000 in your browser to use the GIF converter
   Note: Make sure FFmpeg is installed on your system
   ```

3. **Open your browser and navigate to:**
   ```
   http://localhost:8000
   ```

### Converting a Video to GIF

1. **Upload a video:**
   - Click the upload area or drag and drop a video file
   - Supported formats: MP4, MOV, WEBM, AVI

2. **Adjust settings:**
   - **Frame Rate (FPS)**: Use the slider (5-30 FPS)
     - Lower FPS = smaller file size, choppier animation
     - Higher FPS = larger file size, smoother animation
   - **Width**: Enter custom width (100-1920px) or click preset buttons
   - **Height**: Automatically calculated to maintain aspect ratio
     - Toggle "Lock aspect ratio" to manually set height

3. **Click "Convert to GIF"**

4. **Wait for processing:**
   - The conversion may take 1-5 minutes depending on video length
   - Progress will be shown in real-time

5. **Download your GIF:**
   - Once complete, click "Download GIF"

### Compressing an Image or GIF to Target Size

1. Open `http://localhost:8000/compress.html`
2. Upload an image or GIF
3. Enter your target size in MB (for example, 10)
4. Click **Compress File**
5. Download the compressed file once done

Notes:
- If exact target size is not possible, the app returns the closest smaller/lower-size result it can generate.
- GIF compression uses iterative quality/scale reduction for best size reduction.

## How It Works

The conversion uses a two-pass encoding process for high quality:

1. **Palette Generation**: Analyzes the video to create an optimal color palette
2. **GIF Creation**: Applies the palette to create the final GIF with:
   - Lanczos scaling for high-quality resampling
   - Bayer dithering for smooth color transitions
   - 256-color palette for optimal quality/size balance

## File Structure

```
sandbox/
├── server.js          # Node.js server with FFmpeg conversion
├── gif.html          # Frontend interface
├── compress.html     # Image/GIF compression page
├── compress.js       # Compression page logic
├── package.json      # Node.js dependencies
├── uploads/         # Temporary video uploads (auto-created)
└── outputs/            # Generated GIFs (auto-created)
```

## Troubleshooting

### "Conversion failed" Error

**Check FFmpeg installation:**
```bash
ffmpeg -version
```

If this doesn't work, FFmpeg is not installed or not in your PATH.

**Solutions:**
- Reinstall FFmpeg following the installation instructions above
- Make sure FFmpeg is in your system PATH
- Restart your terminal/server after installing FFmpeg

### "Port 8000 already in use" Error

Another process is using port 8000. Either:
- Stop the other process
- Or change the port in `server.js` (line 19):
  ```javascript
  app.listen(8000, () => {
    // Change 8000 to another port like 3000
  })
  ```

### "No video file provided" Error

- Make sure you selected a video file before clicking convert
- Check that the file is a valid video format (MP4, MOV, WEBM, AVI)

### Large File Sizes

GIFs are inherently large. To reduce size:
- Lower the FPS (try 10-15 FPS)
- Reduce the width (try 480px or 320px)
- Consider converting shorter video clips

### Slow Conversion

Conversion speed depends on:
- Video length
- Video resolution
- Your computer's processing power
- 2-5 minutes is normal for a 30-second video

## Technical Details

- **Server**: Express.js
- **Video Processing**: FFmpeg via fluent-ffmpeg
- **File Upload**: Multer
- **Frontend**: Vanilla JavaScript with modern CSS

## License

MIT

## Support

If you encounter issues:
1. Check that Node.js and FFmpeg are properly installed
2. Check the server console for error messages
3. Verify the video file is not corrupted
4. Try with a smaller/shorter video file first

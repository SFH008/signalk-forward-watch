const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

class RtspGrabber {
  constructor(app) {
    this.app = app;
    this.currentProcess = null;
  }

  async grabFrame(rtspUrl) {
    return new Promise((resolve) => {
      const tempPath = '/tmp/fw-frame.jpg';
      
      // Kill any existing process
      if (this.currentProcess) {
        this.currentProcess.kill();
      }

      const process = ffmpeg(rtspUrl)
        .addOption('-rtsp_transport', 'tcp')
        .addOption('-vframes', '1')
        .addOption('-q:v', '2')
        .on('end', () => {
          this.currentProcess = null;
          if (fs.existsSync(tempPath)) {
            resolve(tempPath);
          } else {
            this.app.debug(`Failed to create frame file: ${tempPath}`);
            resolve(null);
          }
        })
        .on('error', (err) => {
          this.currentProcess = null;
          this.app.debug(`FFmpeg error: ${err.message}`);
          resolve(null);
        })
        .on('start', () => {
          this.currentProcess = process;
        })
        .save(tempPath);

      // Set timeout
      setTimeout(() => {
        if (this.currentProcess === process) {
          process.kill();
          this.currentProcess = null;
          this.app.debug('FFmpeg timeout');
          resolve(null);
        }
      }, 10000);
    });
  }

  stop() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
  }
}

module.exports = RtspGrabber;
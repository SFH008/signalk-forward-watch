const { exec } = require('child_process');

class SignalkOutput {
  constructor(app, options) {
    this.app = app;
    this.options = options;
    this.lastAlertTime = new Map();
    this.audioUnavailable = false;
  }

  sendDetections(detections) {
    const validDetections = detections.filter(detection => 
      detection.position && 
      typeof detection.position.latitude === 'number' && 
      typeof detection.position.longitude === 'number'
    );

    if (validDetections.length > 0) {
      // Send delta with all detections
      this.app.handleMessage(this.app.selfContext, {
        context: this.app.selfContext,
        updates: [{
          source: { type: 'PLUGIN', id: 'signalk-forward-watch' },
          timestamp: new Date().toISOString(),
          values: [
            {
              path: 'environment.forwardWatch.detections',
              value: validDetections
            }
          ]
        }]
      });
    }

    // Process individual detections for notifications
    for (const detection of validDetections) {
      const { className, quadrant, distance, bearing, position } = detection;
      if (!className || !quadrant || typeof distance !== 'number') continue;

      const targetKey = `${className}-${quadrant}`;
      const now = Date.now();

      // Check cooldown
      const lastAlert = this.lastAlertTime.get(targetKey) || 0;
      if (now - lastAlert < (this.options.alert_cooldown * 1000)) {
        continue;
      }

      // Update last alert time
      this.lastAlertTime.set(targetKey, now);

      // Determine severity based on distance
      let severity = 'normal';
      if (distance <= 30) {
        severity = 'emergency';
      } else if (distance <= 75) {
        severity = 'warn';
      }

      // Send notification
      const notificationPath = `notifications.forwardWatch.${className}`;
      
      this.app.handleMessage(this.app.selfContext, {
        context: this.app.selfContext,
        updates: [{
          source: { type: 'PLUGIN', id: 'signalk-forward-watch' },
          timestamp: new Date().toISOString(),
          values: [
            {
              path: notificationPath,
              value: {
                state: 'alert',
                severity: severity,
                message: `${className} detected ${distance}m ahead at bearing ${bearing}`,
                timestamp: new Date().toISOString()
              }
            }
          ]
        }]
      });

      // Play audio alert if enabled and not already failed
      if (this.options.audio_alarm && !this.audioUnavailable) {
        this.playBeep();
      }
    }
  }

  playBeep() {
    let command;
    
    if (process.platform === 'win32') {
      command = 'powershell [console]::beep';
    } else if (process.platform === 'darwin') {
      command = 'afplay /System/Library/Sounds/Ping.aiff';
    } else {
      // Linux/Unix - try paplay first, then aplay
      command = 'which paplay > /dev/null 2>&1 && paplay /usr/share/sounds/alsa/Front_Left.wav || which aplay > /dev/null 2>&1 && aplay -q /usr/share/sounds/alsa/Front_Left.wav';
    }

    exec(command, (error) => {
      if (error) {
        this.audioUnavailable = true;
        this.app.debug('Audio alert failed:', error.message);
      }
    });
  }
}

module.exports = SignalkOutput;
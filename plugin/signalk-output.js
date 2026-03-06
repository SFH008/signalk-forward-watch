const { exec } = require('child_process');

const PLUGIN_ID = 'signalk-forward-watch';

class SignalkOutput {
  constructor(app, options) {
    this.app = app;
    this.options = options;
    this.lastAlertTime = new Map();
    this.audioUnavailable = false;
  }

  sendDetections(detections) {
    // Send all detections (with or without GPS position) to Signal K data stream
    this.app.handleMessage(PLUGIN_ID, {
      updates: [{
        values: [{
          path: 'environment.forwardWatch.detections',
          value: detections
        }]
      }]
    });

    // Notifications only for detections that have GPS position and distance
    const withPosition = detections.filter(d =>
      d.position &&
      typeof d.position.latitude === 'number' &&
      typeof d.distance === 'number'
    );

    for (const detection of withPosition) {
      const { class_name, quadrant, distance, bearing } = detection;
      const targetKey = `${class_name}-${quadrant}`;
      const now = Date.now();

      const lastAlert = this.lastAlertTime.get(targetKey) || 0;
      if (now - lastAlert < (this.options.alert_cooldown || 30) * 1000) continue;
      this.lastAlertTime.set(targetKey, now);

      let severity = 'normal';
      if (distance <= 30) severity = 'emergency';
      else if (distance <= 75) severity = 'warn';

      this.app.handleMessage(PLUGIN_ID, {
        updates: [{
          values: [{
            path: `notifications.forwardWatch.${class_name}`,
            value: {
              state: 'alert',
              severity: severity,
              message: `${class_name} detected ${distance}m ahead at bearing ${bearing}`,
              timestamp: new Date().toISOString()
            }
          }]
        }]
      });

      if (this.options.audio_alarm && !this.audioUnavailable) {
        this.playBeep();
      }
    }
  }

  playBeep() {
    const command = 'which paplay > /dev/null 2>&1 && paplay /usr/share/sounds/alsa/Front_Left.wav || aplay -q /usr/share/sounds/alsa/Front_Left.wav';
    exec(command, (error) => {
      if (error) {
        this.audioUnavailable = true;
        this.app.debug('Audio alarm failed: ' + error.message);
      }
    });
  }
}

module.exports = SignalkOutput;

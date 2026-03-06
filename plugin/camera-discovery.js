const onvif = require('node-onvif');

class CameraDiscovery {
  constructor(app) {
    this.app = app;
  }

  async scan() {
    try {
      const devices = await onvif.startProbe(5000);
      if (!devices || devices.length === 0) {
        return [];
      }

      const cameras = [];

      for (const device of devices) {
        try {
          const info = await device.getDeviceInfo();
          const name = info.friendlyName || device.name || 'Unknown Camera';
          const ip = device.address;

          const profiles = await device.getMediaProfiles();
          let rtsp_url = null;
          
          if (profiles && profiles.length > 0) {
            const firstProfile = profiles[0];
            if (firstProfile && firstProfile.videoEncoderConfiguration) {
              const uri = firstProfile.videoEncoderConfiguration.uri;
              if (uri) {
                rtsp_url = uri;
              }
            }
          }

          // Fallback to basic RTSP URL if we couldn't get it from ONVIF
          if (!rtsp_url) {
            rtsp_url = `rtsp://:@${ip}:554/stream1`;
          }

          cameras.push({
            ip,
            name,
            rtsp_url
          });
        } catch (error) {
          this.app.debug(`Error processing device ${device.address}: ${error.message}`);
        }
      }

      return cameras;
    } catch (error) {
      this.app.debug(`Camera discovery scan failed: ${error.message}`);
      return [];
    }
  }

  async buildRtspUrl(ip, user, pass) {
    try {
      return `rtsp://${user}:${pass}@${ip}:554/stream1`;
    } catch (error) {
      this.app.debug(`Failed to build RTSP URL: ${error.message}`);
      return null;
    }
  }
}

module.exports = CameraDiscovery;
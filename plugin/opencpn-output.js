// Writes forward watch detections into Signal K as fake vessels
// OpenCPN reads them via its existing Signal K connection and displays them as AIS targets

// Fake MMSIs — use range 800000001-800000006 (won't conflict with real vessels)
const CLASS_MMSI = {
  ship:   'urn:mrn:imo:mmsi:800000001',
  boat:   'urn:mrn:imo:mmsi:800000002',
  debris: 'urn:mrn:imo:mmsi:800000003',
  buoy:   'urn:mrn:imo:mmsi:800000004',
  kayak:  'urn:mrn:imo:mmsi:800000005',
  log:    'urn:mrn:imo:mmsi:800000006'
};

const CLASS_LABEL = {
  ship:   'FW-SHIP',
  boat:   'FW-BOAT',
  debris: 'FW-DEBRIS',
  buoy:   'FW-BUOY',
  kayak:  'FW-KAYAK',
  log:    'FW-LOG'
};

class OpenCPNOutput {
  constructor(app) {
    this.app = app;
  }

  sendDetections(detections) {
    const withPos = detections.filter(d =>
      d.position &&
      typeof d.position.latitude === 'number' &&
      typeof d.position.longitude === 'number'
    );

    for (const d of withPos) {
      const context = CLASS_MMSI[d.class_name];
      if (!context) continue;

      this.app.handleMessage('signalk-forward-watch', {
        context: `vessels.${context}`,
        updates: [{
          values: [
            {
              path: 'navigation.position',
              value: {
                latitude: d.position.latitude,
                longitude: d.position.longitude
              }
            },
            {
              path: 'name',
              value: `${CLASS_LABEL[d.class_name]} (${Math.round(d.confidence * 100)}%)`
            },
            {
              path: 'navigation.courseOverGroundTrue',
              value: (d.bearing || 0) * (Math.PI / 180)
            },
            {
              path: 'navigation.speedOverGround',
              value: 0
            }
          ]
        }]
      });

      this.app.debug(`OpenCPN: ${d.class_name} → ${context} at ${d.position.latitude.toFixed(4)},${d.position.longitude.toFixed(4)}`);
    }
  }
}

module.exports = OpenCPNOutput;

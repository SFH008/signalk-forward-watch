const LatLon = require('geodesy/latlon-spherical.js');

class GpsCalculator {
  constructor(app) {
    this.app = app;
  }

  // detection: {cx, cy, w, h, class_name, confidence} (cx/cy/w/h normalized 0-1)
  // boatLat/boatLon: decimal degrees (null if no GPS)
  // boatHeading: degrees true
  calculate(detection, boatLat, boatLon, boatHeading) {
    if (boatLat === null || boatLon === null) return null;

    // Monocular depth estimate: larger box height = closer object
    // h=1.0 → ~5m, h=0.1 → ~50m, h=0.01 → ~500m
    const h = Math.max(0.01, Math.min(1.0, detection.h));
    const distance_m = Math.max(2, Math.min(500, 5 / h));

    // Bearing: centre of frame = straight ahead; 60° FOV assumption
    const bearing_deg = (boatHeading + ((detection.cx - 0.5) * 60) + 360) % 360;

    const start = new LatLon(boatLat, boatLon);
    const dest  = start.destinationPoint(distance_m, bearing_deg);

    return {
      lat:         dest.lat,
      lon:         dest.lon,
      distance_m:  Math.round(distance_m),
      bearing_deg: Math.round(bearing_deg),
      class_name:  detection.class_name,
      confidence:  detection.confidence
    };
  }
}

module.exports = GpsCalculator;

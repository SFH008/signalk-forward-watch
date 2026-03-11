'use strict';

// Thin wrapper around detector-worker.js.
// onnxruntime-node is NOT required here — it lives only in the worker thread,
// so Signal K's main process heap is never touched by the ONNX runtime.

const { Worker } = require('worker_threads');
const path = require('path');

class Detector {
  constructor(app, modelPath) {
    this.app = app;
    this.modelPath = modelPath;
    this.worker = null;
    this._pending = null; // single callback waiting for the next worker response
  }

  // Spawns the worker and loads the ONNX model inside it.
  // Resolves when the worker signals 'ready'.
  init() {
    return new Promise((resolve) => {
      this.worker = new Worker(path.join(__dirname, 'detector-worker.js'));

      this.worker.on('message', (msg) => {
        if (!this._pending) return;
        const cb = this._pending;
        this._pending = null;

        if (msg.type === 'error') {
          this.app.debug('Detector worker: ' + msg.message);
          cb([]); // safe fallback — detect() callers receive empty array
        } else if (msg.type === 'ready') {
          cb(null); // init complete
        } else if (msg.type === 'detections') {
          cb(msg.detections);
        }
      });

      this.worker.on('error', (err) => {
        this.app.debug('Detector worker crashed: ' + err.message);
        if (this._pending) {
          const cb = this._pending;
          this._pending = null;
          cb([]);
        }
      });

      this._pending = resolve;
      this.worker.postMessage({ type: 'init', modelPath: this.modelPath });
    });
  }

  // Sends a frame to the worker for inference.
  // index.js guards against overlapping calls via its this.running flag.
  detect(imagePath, confidenceThreshold = 0.4) {
    if (!this.worker) return Promise.resolve([]);
    return new Promise((resolve) => {
      this._pending = resolve;
      this.worker.postMessage({ type: 'detect', imagePath, confidenceThreshold });
    });
  }

  // Terminates the worker thread and frees its heap.
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = Detector;

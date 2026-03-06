const ort = require('onnxruntime-node');
const sharp = require('sharp');
const fs = require('fs');

const CLASS_NAMES = ['ship', 'boat', 'debris', 'buoy', 'kayak', 'log'];
const IMG_SIZE = 640;

class Detector {
  constructor(app, modelPath) {
    this.app = app;
    this.modelPath = modelPath;
    this.session = null;
  }

  async init() {
    try {
      this.session = await ort.InferenceSession.create(this.modelPath);
      this.app.debug('Detector: ONNX model loaded from ' + this.modelPath);
    } catch (err) {
      this.app.debug('Detector: failed to load model: ' + err.message);
    }
  }

  async detect(imagePath, confidenceThreshold = 0.4) {
    if (!this.session || !fs.existsSync(imagePath)) return [];

    try {
      // Decode JPEG → 640x640 RGB uint8, then normalize to float32 CHW
      const { data } = await sharp(imagePath)
        .resize(IMG_SIZE, IMG_SIZE)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const tensor = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
      for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
        tensor[i]                     = data[i * 3]     / 255.0; // R
        tensor[IMG_SIZE * IMG_SIZE + i]     = data[i * 3 + 1] / 255.0; // G
        tensor[2 * IMG_SIZE * IMG_SIZE + i] = data[i * 3 + 2] / 255.0; // B
      }

      const input = new ort.Tensor('float32', tensor, [1, 3, IMG_SIZE, IMG_SIZE]);
      const outputMap = await this.session.run({ images: input });

      // onnxruntime returns a map keyed by output name
      const outputTensor = outputMap[Object.keys(outputMap)[0]];
      return this.parseOutput(outputTensor, confidenceThreshold);
    } catch (err) {
      this.app.debug('Detector: inference error: ' + err.message);
      return [];
    }
  }

  parseOutput(tensor, confidenceThreshold) {
    // YOLOv8 ONNX output shape: [1, 4+num_classes, num_anchors]
    // = [1, 10, 8400] for 6 classes at 640x640
    const dims = tensor.dims;
    const data = tensor.data;
    const numClasses = CLASS_NAMES.length;
    const numAnchors = dims[2]; // 8400

    const boxes = [];
    for (let i = 0; i < numAnchors; i++) {
      const cx = data[0 * numAnchors + i];
      const cy = data[1 * numAnchors + i];
      const w  = data[2 * numAnchors + i];
      const h  = data[3 * numAnchors + i];

      // Find best class score
      let bestScore = 0;
      let bestClass = 0;
      for (let c = 0; c < numClasses; c++) {
        const score = data[(4 + c) * numAnchors + i];
        if (score > bestScore) {
          bestScore = score;
          bestClass = c;
        }
      }

      if (bestScore >= confidenceThreshold) {
        boxes.push({
          class_id: bestClass,
          class_name: CLASS_NAMES[bestClass],
          confidence: bestScore,
          cx: cx / IMG_SIZE,
          cy: cy / IMG_SIZE,
          w:  w  / IMG_SIZE,
          h:  h  / IMG_SIZE
        });
      }
    }

    return this.nms(boxes, 0.45);
  }

  nms(boxes, iouThreshold) {
    boxes.sort((a, b) => b.confidence - a.confidence);
    const selected = [];
    while (boxes.length > 0) {
      const best = boxes.shift();
      selected.push(best);
      boxes = boxes.filter(b => this.iou(best, b) <= iouThreshold);
    }
    return selected;
  }

  iou(a, b) {
    const ax1 = a.cx - a.w / 2, ay1 = a.cy - a.h / 2;
    const ax2 = a.cx + a.w / 2, ay2 = a.cy + a.h / 2;
    const bx1 = b.cx - b.w / 2, by1 = b.cy - b.h / 2;
    const bx2 = b.cx + b.w / 2, by2 = b.cy + b.h / 2;
    const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
    const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
    if (ix1 >= ix2 || iy1 >= iy2) return 0;
    const inter = (ix2 - ix1) * (iy2 - iy1);
    return inter / ((a.w * a.h) + (b.w * b.h) - inter);
  }
}

module.exports = Detector;

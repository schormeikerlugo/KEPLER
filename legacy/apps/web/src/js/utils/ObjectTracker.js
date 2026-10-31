import { KalmanFilter } from './KalmanFilter.js';

export class ObjectTracker {
    constructor() {
        this.objects = []; // { id, current: {visual}, filteredTarget: {kalman}, missing: 0 }
        this.nextId = 1;
        // Kalman R=0.01 (confía mucho en la medida), Q=0.1 (permite movimiento)
        // Esto limpia el "ruido" de la detección
        this.kalmanConfig = { R: 0.01, Q: 0.1 };

        // LERP Factor: Suavizado VISUAL (60fps)
        // Separa la posición lógica (Kalman) de la visual (Interpolada)
        this.lerpFactor = 0.3;
    }

    /**
     * Update tracker with new detections from AI
     * @param {Array} newDetections - Array of scaled detection objects
     */
    update(newDetections) {
        const matchedIndices = new Set();

        // Match new detections to existing objects
        newDetections.forEach(detection => {
            let bestIdx = -1;
            let bestIoU = 0;

            this.objects.forEach((obj, idx) => {
                if (matchedIndices.has(idx)) return;
                if (obj.class !== detection.class) return;

                // Usamos filteredTarget (Lógica) para el trackeo, no current (Visual)
                const targetBBox = obj.filteredTarget ? obj.filteredTarget.bbox : obj.current.bbox;
                const val = this.iou(targetBBox, detection.bbox);

                if (val > bestIoU) {
                    bestIoU = val;
                    bestIdx = idx;
                }
            });

            if (bestIoU > 0.3) {
                // Update Existing Object
                matchedIndices.add(bestIdx);
                const obj = this.objects[bestIdx];

                obj.missing = 0;

                // 1. Kalman Filter UPDATE (Posición Lógica "Real")
                // Filtramos la nueva detección para quitar ruido
                if (!obj.filteredTarget) obj.filteredTarget = JSON.parse(JSON.stringify(detection));
                if (!obj.filters) this.initFilters(obj, detection);

                obj.filteredTarget.bbox[0] = obj.filters.x.filter(detection.bbox[0]);
                obj.filteredTarget.bbox[1] = obj.filters.y.filter(detection.bbox[1]);
                obj.filteredTarget.bbox[2] = obj.filters.w.filter(detection.bbox[2]);
                obj.filteredTarget.bbox[3] = obj.filters.h.filter(detection.bbox[3]);

                // Actualizar metadatos
                obj.filteredTarget.score = detection.score;
                obj.filteredTarget.distance = detection.distance;

            } else {
                // Create New Object
                const newObj = {
                    id: this.nextId++,
                    class: detection.class,
                    // filteredTarget: Posición filtrada por Kalman (Objetivo Lógico)
                    filteredTarget: JSON.parse(JSON.stringify(detection)),
                    // current: Posición visual actual (se moverá hacia filteredTarget con LERP)
                    current: JSON.parse(JSON.stringify(detection)),
                    missing: 0
                };

                this.initFilters(newObj, detection);

                // Inicializar primera pasada de filtro
                newObj.filteredTarget.bbox[0] = newObj.filters.x.filter(detection.bbox[0]);
                newObj.filteredTarget.bbox[1] = newObj.filters.y.filter(detection.bbox[1]);
                newObj.filteredTarget.bbox[2] = newObj.filters.w.filter(detection.bbox[2]);
                newObj.filteredTarget.bbox[3] = newObj.filters.h.filter(detection.bbox[3]);

                this.objects.push(newObj);
            }
        });

        // Mark missing objects
        this.objects.forEach((obj, idx) => {
            if (!matchedIndices.has(idx)) {
                obj.missing++;
            }
        });

        // Remove lost objects (after 10 frames ~160ms for smoother fade out)
        this.objects = this.objects.filter(obj => obj.missing < 10);
    }

    initFilters(obj, detection) {
        obj.filters = {
            x: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q),
            y: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q),
            w: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q),
            h: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q)
        };
    }

    /**
     * Get interpolated object positions for the current frame
     * Call this inside the requestAnimationFrame loop (60FPS)
     */
    getSmoothedObjects() {
        if (this.objects.length === 0) return [];

        return this.objects.map(obj => {
            // LERP VISUAL: Mover 'current' hacia 'filteredTarget' suavemente
            // Esto desacopla los FPS de detección (bajos) de los FPS de render (altos)
            if (obj.filteredTarget) {
                obj.current.bbox[0] += (obj.filteredTarget.bbox[0] - obj.current.bbox[0]) * this.lerpFactor;
                obj.current.bbox[1] += (obj.filteredTarget.bbox[1] - obj.current.bbox[1]) * this.lerpFactor;
                obj.current.bbox[2] += (obj.filteredTarget.bbox[2] - obj.current.bbox[2]) * this.lerpFactor;
                obj.current.bbox[3] += (obj.filteredTarget.bbox[3] - obj.current.bbox[3]) * this.lerpFactor;

                // Suavizar distancia también
                obj.current.distance += (obj.filteredTarget.distance - obj.current.distance) * (this.lerpFactor * 0.5);
                obj.current.score = obj.filteredTarget.score;
            }

            return obj.current;
        });
    }

    iou(box1, box2) {
        const [x1, y1, w1, h1] = box1;
        const [x2, y2, w2, h2] = box2;

        const xA = Math.max(x1, x2);
        const yA = Math.max(y1, y2);
        const xB = Math.min(x1 + w1, x2 + w2);
        const yB = Math.min(y1 + h1, y2 + h2);

        const intersection = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const area1 = w1 * h1;
        const area2 = w2 * h2;
        const union = area1 + area2 - intersection;

        return union === 0 ? 0 : intersection / union;
    }
}

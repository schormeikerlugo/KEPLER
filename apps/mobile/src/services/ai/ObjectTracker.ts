/**
 * ObjectTracker — IoU matching + per-axis Kalman smoothing + LERP.
 *
 * Direct port of the web ObjectTracker.js, typed for TS.
 *
 * Workflow:
 *   1. `update(rawDetections)` is called whenever the backend returns a frame.
 *      It matches new detections to existing tracks via IoU and updates the
 *      Kalman-filtered "logical" position.
 *   2. `getSmoothed()` is called every render frame (in mobile this is on demand
 *      from the React render, not requestAnimationFrame). It LERPs the visual
 *      position toward the filtered position so we get smooth bboxes even
 *      though detection runs at 2-4 FPS on mobile.
 */

import { KalmanFilter } from './KalmanFilter';
import type { ScaledPrediction } from './types';

interface TrackedObject {
    id: number;                 // internal tracker ID (not ByteTrack ID)
    class: string;
    track_id?: number;          // ByteTrack ID from backend
    /** Filtered "logical" position (Kalman). */
    filteredTarget: ScaledPrediction;
    /** Visual position interpolated toward filteredTarget. */
    current: ScaledPrediction;
    /** Frames since last seen. */
    missing: number;
    filters: {
        x: KalmanFilter;
        y: KalmanFilter;
        w: KalmanFilter;
        h: KalmanFilter;
    };
}

export class ObjectTracker {
    private objects: TrackedObject[] = [];
    private nextId = 1;
    private kalmanConfig = { R: 0.01, Q: 0.1 };
    // Mobile uses Animated.timing(250ms) on the native driver for visual
    // smoothing — JS-side LERP is not needed and would only slow the
    // tracker's response to genuine movement. Set to 1.0 = "snap to
    // filtered position" (Kalman still does noise reduction).
    private lerpFactor = 1.0;

    /** Receive new (already scaled) detections from the engine. */
    update(newDetections: ScaledPrediction[]): void {
        const matchedIndices = new Set<number>();

        for (const detection of newDetections) {
            let bestIdx = -1;
            let bestIoU = 0;

            for (let idx = 0; idx < this.objects.length; idx++) {
                if (matchedIndices.has(idx)) continue;
                const obj = this.objects[idx];
                if (obj.class !== detection.class) continue;

                // Prefer ByteTrack ID match if both have it (very high confidence)
                if (
                    obj.track_id != null &&
                    detection.track_id != null &&
                    obj.track_id === detection.track_id
                ) {
                    bestIdx = idx;
                    bestIoU = 1;
                    break;
                }

                const targetBBox = obj.filteredTarget.bbox;
                const val = this.iou(targetBBox, detection.bbox);
                if (val > bestIoU) {
                    bestIoU = val;
                    bestIdx = idx;
                }
            }

            if (bestIdx >= 0 && bestIoU > 0.3) {
                // Update existing
                matchedIndices.add(bestIdx);
                const obj = this.objects[bestIdx];
                obj.missing = 0;
                obj.track_id = detection.track_id ?? obj.track_id;

                obj.filteredTarget.bbox[0] = obj.filters.x.filter(detection.bbox[0]);
                obj.filteredTarget.bbox[1] = obj.filters.y.filter(detection.bbox[1]);
                obj.filteredTarget.bbox[2] = obj.filters.w.filter(detection.bbox[2]);
                obj.filteredTarget.bbox[3] = obj.filters.h.filter(detection.bbox[3]);
                obj.filteredTarget.score = detection.score;
                obj.filteredTarget.distance = detection.distance;
                obj.filteredTarget.track_id = detection.track_id;
            } else {
                // Create new
                const newObj: TrackedObject = {
                    id: this.nextId++,
                    class: detection.class,
                    track_id: detection.track_id,
                    filteredTarget: this.cloneDetection(detection),
                    current: this.cloneDetection(detection),
                    missing: 0,
                    filters: this.makeFilters(),
                };

                newObj.filteredTarget.bbox[0] = newObj.filters.x.filter(detection.bbox[0]);
                newObj.filteredTarget.bbox[1] = newObj.filters.y.filter(detection.bbox[1]);
                newObj.filteredTarget.bbox[2] = newObj.filters.w.filter(detection.bbox[2]);
                newObj.filteredTarget.bbox[3] = newObj.filters.h.filter(detection.bbox[3]);

                this.objects.push(newObj);
            }
        }

        // Mark missing
        for (let idx = 0; idx < this.objects.length; idx++) {
            if (!matchedIndices.has(idx)) {
                this.objects[idx].missing++;
            }
        }

        // Drop lost (10 frames @ 3 FPS ≈ 3.3s)
        this.objects = this.objects.filter((o) => o.missing < 10);
    }

    /** LERP-smoothed visual positions for rendering. */
    getSmoothed(): ScaledPrediction[] {
        if (this.objects.length === 0) return [];
        return this.objects.map((obj) => {
            const f = obj.filteredTarget;
            const c = obj.current;
            c.bbox[0] += (f.bbox[0] - c.bbox[0]) * this.lerpFactor;
            c.bbox[1] += (f.bbox[1] - c.bbox[1]) * this.lerpFactor;
            c.bbox[2] += (f.bbox[2] - c.bbox[2]) * this.lerpFactor;
            c.bbox[3] += (f.bbox[3] - c.bbox[3]) * this.lerpFactor;
            c.distance += (f.distance - c.distance) * (this.lerpFactor * 0.5);
            c.score = f.score;
            c.track_id = f.track_id;
            return { ...c, bbox: [...c.bbox] as ScaledPrediction['bbox'] };
        });
    }

    /** Clear all tracks (e.g. when the camera re-mounts). */
    reset(): void {
        this.objects = [];
        this.nextId = 1;
    }

    private cloneDetection(d: ScaledPrediction): ScaledPrediction {
        return {
            class: d.class,
            score: d.score,
            bbox: [...d.bbox] as ScaledPrediction['bbox'],
            distance: d.distance,
            track_id: d.track_id,
        };
    }

    private makeFilters() {
        return {
            x: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q),
            y: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q),
            w: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q),
            h: new KalmanFilter(this.kalmanConfig.R, this.kalmanConfig.Q),
        };
    }

    private iou(
        box1: [number, number, number, number],
        box2: [number, number, number, number]
    ): number {
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

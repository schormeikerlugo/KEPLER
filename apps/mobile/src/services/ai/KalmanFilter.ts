/**
 * Simple 1D Kalman Filter for smooth tracking.
 * Constant-velocity model. Direct port from the web's KalmanFilter.js.
 */

export class KalmanFilter {
    R: number; // measurement noise (trust the detector)
    Q: number; // process noise (allow movement)
    A: number;
    B: number;
    C: number;
    cov: number = NaN;
    x: number = NaN;

    constructor(R = 1, Q = 1, A = 1, B = 0, C = 1) {
        this.R = R;
        this.Q = Q;
        this.A = A;
        this.B = B;
        this.C = C;
    }

    filter(z: number, u: number = 0): number {
        if (Number.isNaN(this.x)) {
            this.x = (1 / this.C) * z;
            this.cov = (1 / this.C) * this.R * (1 / this.C);
        } else {
            const predX = this.A * this.x + this.B * u;
            const predCov = this.A * this.cov * this.A + this.Q;
            const K = predCov * this.C * (1 / (this.C * predCov * this.C + this.R));
            this.x = predX + K * (z - this.C * predX);
            this.cov = predCov - K * this.C * predCov;
        }
        return this.x;
    }

    predict(u: number = 0): number {
        return this.A * this.x + this.B * u;
    }
}

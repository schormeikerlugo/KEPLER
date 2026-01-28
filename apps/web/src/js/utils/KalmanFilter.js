/**
 * Simple 1D Kalman Filter for smooth tracking
 * Based on constant velocity model:
 * x = x + v
 * v = v
 */
export class KalmanFilter {
    /**
     * @param {number} R - Measurement Noise (how much we trust the detector) - High = trust model more
     * @param {number} Q - Process Noise (how much the object jitters) - High = faster reaction
     * @param {number} A - State transition (1 for constant state)
     * @param {number} B - Control variance
     * @param {number} C - Measurement mapping
     */
    constructor(R = 1, Q = 1, A = 1, B = 0, C = 1) {
        this.R = R; // Noise de medición (Detección YOLO)
        this.Q = Q; // Noise del proceso (Movimiento real)
        this.A = A;
        this.B = B;
        this.C = C;

        this.cov = NaN;
        this.x = NaN; // Valor estimado
    }

    /**
     * Filter a new value
     * @param {number} z - Measurement (medición cruda)
     * @param {number} u - Control input (opcional)
     * @return {number} - Filtered value
     */
    filter(z, u = 0) {
        if (isNaN(this.x)) {
            // Inicialización con primera medición
            this.x = (1 / this.C) * z;
            this.cov = (1 / this.C) * this.R * (1 / this.C);
        } else {
            // 1. Predicción (Time Update)
            const predX = (this.A * this.x) + (this.B * u);
            const predCov = ((this.A * this.cov) * this.A) + this.Q;

            // 2. Corrección (Measurement Update)
            const K = predCov * this.C * (1 / ((this.C * predCov * this.C) + this.R)); // Kalman Gain
            this.x = predX + K * (z - (this.C * predX));
            this.cov = predCov - (K * this.C * predCov);
        }
        return this.x;
    }

    /**
     * Predict future state (without measurement)
     * Useful for missing frames
     */
    predict(u = 0) {
        return (this.A * this.x) + (this.B * u);
    }
}

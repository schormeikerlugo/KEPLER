import { ARAnimations } from '../../../js/utils/ar-animations.js';

export class ARUIController {
    constructor(container) {
        this.container = container;
        this.ui = {
            compassStrip: null,
            compassIndicator: null,
            fovLabel: null,
            latLabel: null,
            lngLabel: null,
            headLabel: null,
            labelsContainer: null,
            telemetryContainer: null,
            telemetryPanel: null,
            toggleTelemBtn: null,
            toast: null,
            btnScan: null,
            btnTeach: null,
            btnTick: null,
            btnAiChat: null,
            btnMap: null,
            btnSettings: null,
            modalAi: null,
            closeModalBtn: null,
            headLabel: null
        };
    }

    // Initialize UI Cache from DOM (After template insertion)
    init() {
        // Cache UI elements
        this.ui.compassStrip = document.getElementById('compass-strip');
        this.ui.compassIndicator = document.querySelector('.compass-indicator');
        this.ui.latLabel = document.getElementById('gps-lat');
        this.ui.lngLabel = document.getElementById('gps-lng');
        this.ui.headLabel = document.getElementById('gps-head');
        this.ui.labelsContainer = document.getElementById('labels-container');
        this.ui.telemetryContainer = document.querySelector('.ar-telemetry-container');
        this.ui.telemetryPanel = document.getElementById('ar-telemetry');
        this.ui.toggleTelemBtn = document.getElementById('btn-toggle-telemetry');

        this.ui.btnScan = document.getElementById('btn-scan');
        this.ui.btnTeach = document.getElementById('btn-teach');
        this.ui.btnTick = document.getElementById('btn-tick');
        this.ui.btnAiChat = document.getElementById('btn-ai-chat');
        this.ui.btnMap = document.getElementById('btn-map');
        this.ui.btnSettings = document.getElementById('btn-settings');
        this.ui.modalAi = document.getElementById('ai-chat-modal');
        this.ui.closeModalBtn = document.querySelector('.close-modal');

        this.ui.toast = document.getElementById('detection-alert');
    }

    animateHUDEntry() {
        const topBar = document.querySelector('.hud-top-bar');
        const compass = document.querySelector('.hud-compass');
        const reticle = document.querySelector('.hud-reticle');
        const controls = document.querySelector('.hud-controls');

        if (topBar) ARAnimations.animateHUDEntry(topBar, 'left');
        if (compass) ARAnimations.animateHUDEntry(compass, 'right');
        if (reticle) ARAnimations.animateHUDEntry(reticle, 'center');
        if (controls) ARAnimations.animateHUDEntry(controls, 'bottom');
    }

    showToast(msg, duration = 2000) {
        if (!this.ui.toast) return;
        this.ui.toast.textContent = msg;
        this.ui.toast.style.display = 'block';
        if (duration > 0) setTimeout(() => { this.ui.toast.style.display = 'none'; }, duration);
    }

    updateGPS(position) {
        const { lat, lng, source } = position;

        // Update Dedicated Badge
        const badge = document.getElementById('ar-gps-source-badge');
        if (badge) {
            badge.style.display = 'inline-block';
            badge.textContent = source || 'GPS';

            const color = source === 'MANUAL' ? 'orange' : (source === 'IP' ? '#ffff00' : '#00ff00');
            badge.style.borderColor = color;
            badge.style.color = color;
        }

        // Update Settings Panel Status (Mobile)
        const settingsBadge = document.getElementById('settings-gps-status');
        if (settingsBadge) {
            settingsBadge.textContent = source || 'GPS';
            const color = source === 'MANUAL' ? 'orange' : (source === 'IP' ? '#ffff00' : '#00ff00');
            settingsBadge.style.color = color;
            settingsBadge.style.border = `1px solid ${color}`;
        }

        // Keep Lat/Lng clean
        if (this.ui.latLabel) this.ui.latLabel.textContent = lat.toFixed(6);
        if (this.ui.lngLabel) this.ui.lngLabel.textContent = lng.toFixed(6);
    }

    updateHeading(heading) {
        if (this.ui.headLabel) this.ui.headLabel.textContent = heading.toFixed(0) + "°";
        if (this.ui.compassStrip) {
            ARAnimations.animateCompass(this.ui.compassStrip, heading);
        }
    }

    showPermissionButton(onGrant) {
        const btn = document.createElement('button');
        btn.innerHTML = "ACTIVAR SENSORES AR";
        btn.className = 'btn-permission';

        btn.onclick = async () => {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    btn.remove();
                    onGrant();
                } else {
                    btn.innerHTML = "PERMISO DENEGADO";
                    btn.classList.add('denied');
                }
            } catch (e) {
                console.error(e);
                btn.remove();
                onGrant(); // Try anyway for non-iOS
            }
        };

        this.container.appendChild(btn);
    }

    renderDetectionBoxes(predictions, videoElement) {
        const container = document.getElementById('detection-boxes-container');
        if (!container) return;

        // Clear previous dynamic boxes
        const children = Array.from(container.children);
        children.forEach(child => {
            if (child.id !== 'target-lock') child.remove();
        });

        predictions.forEach(pred => {
            const coords = this.getScreenCoordinates(pred.bbox, videoElement);
            if (!coords) return;

            const box = document.createElement('div');
            box.className = 'detection-box';
            box.style.left = `${coords.x}px`;
            box.style.top = `${coords.y}px`;
            box.style.width = `${coords.width}px`;
            box.style.height = `${coords.height}px`;

            // Color based on confidence
            const color = pred.score > 0.6 ? '#3FA8FF' : 'orange';
            box.style.borderColor = color;
            box.style.boxShadow = `0 0 10px ${color}`;

            // Add Label
            const label = document.createElement('div');
            label.textContent = `${pred.class.toUpperCase()} ${(pred.score * 100).toFixed(0)}%`;
            label.style.position = 'absolute';
            label.style.top = '-20px';
            label.style.left = '0';
            label.style.background = color;
            label.style.color = '#000';
            label.style.fontSize = '10px';
            label.style.padding = '2px 4px';
            label.style.fontWeight = 'bold';

            box.appendChild(label);
            container.appendChild(box);
        });
    }

    getScreenCoordinates(bbox, video) {
        if (!video) return null;

        const videoW = video.videoWidth;
        const videoH = video.videoHeight;
        if (videoW === 0 || videoH === 0) return null;

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        // Calculate Scale (Cover logic)
        const scale = Math.max(screenW / videoW, screenH / videoH);

        // Calculate Rendered Dimensions
        const renderedW = videoW * scale;
        const renderedH = videoH * scale;

        // Calculate Offsets (Centered)
        const offsetX = (screenW - renderedW) / 2;
        const offsetY = (screenH - renderedH) / 2;

        const [vx, vy, vw, vh] = bbox;

        // Map
        const x = vx * scale + offsetX;
        const y = vy * scale + offsetY;
        const width = vw * scale;
        const height = vh * scale;

        return { x, y, width, height };
    }

    openMarkerModal(poi) {
        const modal = document.getElementById('description-modal');
        const content = document.getElementById('description-content');
        const title = modal.querySelector('h2') || document.createElement('h2');

        if (!modal || !content) return;

        // Ensure Title Exists
        if (!modal.querySelector('h2')) {
            title.style.margin = '0 0 10px 0';
            title.style.color = '#3FA8FF';
            content.parentNode.insertBefore(title, content);
        } else {
            modal.querySelector('h2').textContent = poi.title;
        }

        // Format Content
        const meta = poi.metadata || {};
        const time = meta.timestamp ? new Date(meta.timestamp).toLocaleString() : 'N/A';
        const type = poi.type || 'Unknown';

        content.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="font-size:1.1rem; color:#fff;">${meta.description || poi.description || "Sin descripción disponible."}</div>
                <div style="border-top:1px solid rgba(63,168,255,0.3); padding-top:10px; margin-top:10px; font-size:0.8rem; color:#aaa;">
                    <div><strong>TIPO:</strong> ${type.toUpperCase()}</div>
                    <div><strong>REGISTRO:</strong> ${time}</div>
                    <div><strong>DISTANCIA:</strong> ${meta.distance ? meta.distance.toFixed(1) + 'm' : 'Calulando...'}</div>
                    <div><strong>REGISTRADO POR:</strong> ${meta.registered_by || 'Sistema'}</div>
                </div>
            </div>
        `;

        modal.style.display = 'block';

        // Close Handler (One-time)
        const closeBtn = document.getElementById('btn-description-close');
        if (closeBtn) {
            closeBtn.onclick = () => modal.style.display = 'none';
        }
    }
}

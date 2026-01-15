/**
 * Mission Module
 * Handles mission modal, start mission flow, and navigation buttons
 */

import { dbService } from '../../../../js/services/DatabaseService.js';

export function initMission() {
    const startBtn = document.getElementById('btn-start-mission');
    const missionModal = document.getElementById('mission-modal');
    const closeMissionBtn = document.getElementById('btn-close-mission');
    const confirmMissionBtn = document.getElementById('btn-confirm-start-mission');

    if (startBtn && missionModal) {
        // Open Modal
        startBtn.addEventListener('click', () => {
            missionModal.style.display = 'flex';
        });

        // Close Modal
        if (closeMissionBtn) {
            closeMissionBtn.addEventListener('click', () => {
                missionModal.style.display = 'none';
            });
        }

        // Confirm Start
        if (confirmMissionBtn) {
            confirmMissionBtn.addEventListener('click', async () => {
                const titleInput = document.getElementById('inp-dash-mission-title');
                const zoneInput = document.getElementById('inp-dash-mission-zone');

                const title = titleInput.value || "Misión Exploración";
                const zone = zoneInput.value || "Sector Desconocido";

                try {
                    confirmMissionBtn.textContent = 'Iniciando...';
                    await dbService.startMission(title, zone);
                    window.history.pushState({}, '', '/ar');
                    window.location.reload();
                } catch (e) {
                    console.error("Error starting mission:", e);
                    alert("Error al iniciar misión. Revisa consola.");
                    confirmMissionBtn.textContent = 'DESPEGAR 🚀';
                }
            });
        }
    }

    // Archives Button Logic
    const archivesBtn = document.getElementById('btn-archives');
    if (archivesBtn) {
        archivesBtn.addEventListener('click', () => {
            window.location.href = '/src/features/archives/archives.html';
        });
    }

    // Taxonomy Button Logic
    const taxonomiaBtn = document.getElementById('btn-taxonomia');
    if (taxonomiaBtn) {
        taxonomiaBtn.addEventListener('click', () => {
            window.location.href = '/taxonomia';
        });
    }

    return missionModal;
}

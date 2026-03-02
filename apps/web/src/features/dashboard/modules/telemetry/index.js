/**
 * Telemetry Module
 * Handles real-time telemetry polling and display updates with ApexCharts
 */

import { api } from '../../../../js/services/api.js';
import ApexCharts from 'apexcharts';

export async function initTelemetry() {
    const charts = {};

    // Common Sparkline Config
    const sparkConfig = {
        chart: {
            type: 'area', width: '100%', height: 50,
            sparkline: { enabled: true }, animations: { enabled: true, dynamicAnimation: { speed: 800 } }
        },
        stroke: { curve: 'smooth', width: 2 },
        fill: { opacity: 0.3 },
        tooltip: { fixed: { enabled: false }, x: { show: false }, y: { title: { formatter: () => '' } }, marker: { show: false } }
    };

    // 1. O2 Tank (Area)
    const o2Data = Array(15).fill(96);
    charts.o2 = new ApexCharts(document.querySelector("#chart-o2"), {
        ...sparkConfig, colors: ['#00ffcc'], series: [{ data: o2Data }]
    });

    // 2. BPM (Line - EKG)
    const bpmData = Array(20).fill(75);
    charts.bpm = new ApexCharts(document.querySelector("#chart-bpm"), {
        ...sparkConfig, chart: { ...sparkConfig.chart, type: 'line' }, colors: ['#3FA8FF'], fill: { opacity: 1 }, series: [{ data: bpmData }]
    });

    // 3. RAD (Bar)
    const radData = Array(10).fill(0.011);
    charts.rad = new ApexCharts(document.querySelector("#chart-rad"), {
        ...sparkConfig, chart: { ...sparkConfig.chart, type: 'bar' }, colors: ['#FF4444'], series: [{ data: radData }]
    });

    // 4. PWR (RadialBar)
    charts.pwr = new ApexCharts(document.querySelector("#chart-pwr"), {
        chart: { type: 'radialBar', width: '100%', height: 90, sparkline: { enabled: true }, offsetY: -10 },
        series: [100],
        colors: ['#00ffcc'],
        plotOptions: { radialBar: { hollow: { margin: 0, size: '50%' }, track: { background: 'rgba(255,255,255,0.1)' }, dataLabels: { show: false } } }
    });

    // 5. DIST (Area)
    const distData = Array(15).fill(0);
    charts.dist = new ApexCharts(document.querySelector("#chart-dist"), {
        ...sparkConfig, colors: ['#A4B0C0'], series: [{ data: distData }]
    });

    // 6. CREW (Bar)
    const crewData = Array(8).fill(1);
    charts.crew = new ApexCharts(document.querySelector("#chart-crew"), {
        ...sparkConfig, chart: { ...sparkConfig.chart, type: 'bar' }, colors: ['#3FA8FF'], series: [{ data: crewData }]
    });

    // 7. TEMP (Area)
    const tempData = Array(15).fill(20);
    charts.temp = new ApexCharts(document.querySelector("#chart-temp"), {
        ...sparkConfig, colors: ['#00ffcc'], series: [{ data: tempData }]
    });

    // 8. OBJ (Scatter/Area)
    const objData = Array(15).fill(0);
    charts.obj = new ApexCharts(document.querySelector("#chart-obj"), {
        ...sparkConfig, colors: ['#FFAA00'], series: [{ data: objData }]
    });

    // Render all charts
    Object.values(charts).forEach(c => {
        if (c.el) c.render(); // check if element exists
    });

    // Elements
    const els = {
        temp: document.getElementById('telem-temp'),
        o2: document.getElementById('telem-o2'),
        bpm: document.getElementById('telem-bpm'),
        rad: document.getElementById('telem-rad'),
        pwr: document.getElementById('telem-pwr'),
        dist: document.getElementById('telem-dist'),
        crew: document.getElementById('telem-crew'),
        obj: document.getElementById('telem-nearby-obj')
    };

    // Battery Init
    let batteryManager = null;
    if (navigator.getBattery) navigator.getBattery().then(b => batteryManager = b);

    // Helpers to push data safely
    const pushData = (arr, val, limit) => { arr.push(val); if (arr.length > limit) arr.shift(); return arr; };

    let totalDistBase = 0; // fallback if no GPS

    const update = async () => {
        if (!els.temp) return; // Unmounted

        try {
            const data = await api.getTelemetry();

            // Generate/Extract values
            let vTemp = 20, vO2 = 96, vBpm = 75, vRad = 0.011, vObj = 0;

            if (data) {
                vTemp = data.temperature; vO2 = data.oxygen_level;
                vBpm = data.heart_rate; vRad = data.radiation;
            } else {
                vTemp = parseFloat((20 + Math.random() * 0.5).toFixed(1));
                vO2 = parseFloat((96 + Math.random() * 0.2).toFixed(1));
                vBpm = Math.floor(75 + Math.random() * 5);
                vRad = parseFloat((0.011 + Math.random() * 0.005).toFixed(3));
            }

            // Obj count from UI
            const globalObj = document.getElementById('objects-count');
            if (globalObj) vObj = parseInt(globalObj.textContent) || 0;

            // Update DOM text
            els.temp.innerHTML = `${vTemp} <span class="unit">°C</span>`;
            els.o2.innerHTML = `${vO2}%`;
            els.bpm.innerHTML = `${vBpm}`;
            els.rad.innerHTML = `${vRad} <span class="unit">mSv/h</span>`;
            els.obj.innerHTML = `${vObj} <span class="unit">Ping</span>`;

            // Update Charts
            if (charts.temp) charts.temp.updateSeries([{ data: pushData(tempData, vTemp, 15) }]);
            if (charts.o2) charts.o2.updateSeries([{ data: pushData(o2Data, vO2, 15) }]);
            if (charts.bpm) charts.bpm.updateSeries([{ data: pushData(bpmData, vBpm, 20) }]);
            if (charts.rad) charts.rad.updateSeries([{ data: pushData(radData, vRad, 10) }]);
            if (charts.obj) charts.obj.updateSeries([{ data: pushData(objData, vObj, 15) }]);

            // PWR
            if (batteryManager) {
                let lvl = Math.floor(batteryManager.level * 100);
                els.pwr.innerHTML = `${lvl}%`;
                if (charts.pwr) charts.pwr.updateSeries([lvl]);
            }

            // Crew
            const { supabase } = await import('../../../../js/auth.js');
            const { count } = await supabase.from('misiones').select('*', { count: 'exact', head: true }).eq('estado', 'activa');
            let vCrew = Math.max(1, count || 1);
            els.crew.innerHTML = `${vCrew} <span class="unit">Active</span>`;
            if (charts.crew) charts.crew.updateSeries([{ data: pushData(crewData, vCrew, 8) }]);

        } catch (err) {
            console.error('Telemetry err:', err);
        }

        setTimeout(update, 2000);
    };

    update();

    // Init GPS Check for Status Badge & Distance Calculation
    import('../../../../js/engines/GPSEngine.js').then(module => {
        const GPSEngine = module.GPSEngine;
        const gps = new GPSEngine();

        let totalDistanceKm = 0;
        let lastPos = null;

        function calcDist(lat1, lon1, lat2, lon2) {
            const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        gps.onPositionUpdate = (pos) => {
            if (lastPos && pos.source !== 'IP') {
                const dist = calcDist(lastPos.lat, lastPos.lng, pos.lat, pos.lng);
                if (dist > 0.001 && dist < 1.0) totalDistanceKm += dist;
            }
            lastPos = pos;
            if (els.dist) {
                els.dist.innerHTML = `${totalDistanceKm.toFixed(2)} <span class="unit">km</span>`;
                if (charts.dist) charts.dist.updateSeries([{ data: pushData(distData, totalDistanceKm, 15) }]);
            }
        };

        gps.start(); // Fallback to IP
    }).catch(e => console.error("GPS fail", e));
}

/**
 * Map HTML Template
 * Leaflet WebView HTML generator
 */

export interface MapHtmlOptions {
    lat: number;
    lng: number;
    zoom?: number;
    tileUrl: string;
}

/**
 * Generates the HTML for the Leaflet map WebView
 */
export const generateMapHtml = (options: MapHtmlOptions): string => {
    const { lat, lng, zoom = 15, tileUrl } = options;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin: 0; padding: 0; }
        html, body, #map { 
            width: 100%; 
            height: 100%; 
            background: #0a0f14; 
        }
        .leaflet-control-zoom, 
        .leaflet-control-attribution { 
            display: none !important; 
        }
        .user-marker {
            width: 20px; 
            height: 20px;
            background: radial-gradient(circle, #00f7ff 0%, #0088aa 100%);
            border-radius: 50%; 
            border: 3px solid #fff;
            box-shadow: 0 0 15px rgba(0,247,255,0.8), 0 0 30px rgba(0,247,255,0.4);
            animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { 
                transform: scale(1); 
                box-shadow: 0 0 15px rgba(0,247,255,0.8); 
            }
            50% { 
                transform: scale(1.1); 
                box-shadow: 0 0 25px rgba(0,247,255,1); 
            }
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        // Initialize map
        var map = L.map('map', { 
            zoomControl: false, 
            attributionControl: false 
        }).setView([${lat}, ${lng}], ${zoom});
        
        // Tile layer
        var tileLayer = L.tileLayer('${tileUrl}', { 
            maxZoom: 19, 
            subdomains: 'abcd' 
        }).addTo(map);
        
        // User marker
        var userIcon = L.divIcon({ 
            className: 'user-marker', 
            iconSize: [20, 20], 
            iconAnchor: [10, 10] 
        });
        var userMarker = L.marker([${lat}, ${lng}], { icon: userIcon }).addTo(map);
        
        // Accuracy circle
        L.circle([${lat}, ${lng}], { 
            radius: 50, 
            color: '#00f7ff', 
            fillColor: '#00f7ff', 
            fillOpacity: 0.1, 
            weight: 1 
        }).addTo(map);
        
        // Global function to change layer
        window.changeLayer = function(url) { 
            tileLayer.setUrl(url); 
        };
        
        // Global function to fly to location
        window.flyToLocation = function(lat, lng, zoom) {
            map.flyTo([lat, lng], zoom || 17);
            userMarker.setLatLng([lat, lng]);
        };
        
        // Report coordinates on move
        map.on('moveend', function() {
            var c = map.getCenter();
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'coords', 
                lat: c.lat, 
                lng: c.lng, 
                zoom: map.getZoom() 
            }));
        });
        
        // Report ready state
        map.whenReady(function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'coords', 
                lat: ${lat}, 
                lng: ${lng}, 
                zoom: ${zoom} 
            }));
        });
    </script>
</body>
</html>`;
};

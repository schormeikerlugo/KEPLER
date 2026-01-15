#!/bin/bash
# KEPLER PMTiles Region Downloader
# Downloads and extracts vector map data for specific regions

set -e

PMTILES_DIR="$(dirname "$0")/../data/pmtiles"
mkdir -p "$PMTILES_DIR"

# Latest Protomaps basemap build
PLANET_URL="https://build.protomaps.com/20240101.pmtiles"

# Region bounding boxes (lon_min, lat_min, lon_max, lat_max)
declare -A REGIONS
REGIONS["venezuela"]="-73.5,0.5,-59.5,12.5"
REGIONS["colombia"]="-82.0,-5.0,-66.0,13.5"
REGIONS["brazil"]="-74.0,-34.0,-32.0,5.5"
REGIONS["peru"]="-81.5,-18.5,-68.5,0.0"
REGIONS["chile"]="-76.0,-56.0,-66.0,-17.5"
REGIONS["argentina"]="-73.5,-55.0,-53.5,-21.5"
REGIONS["ecuador"]="-81.5,-5.0,-75.0,1.5"
REGIONS["bolivia"]="-70.0,-23.0,-57.5,-9.5"

# Check if pmtiles CLI is installed
if ! command -v pmtiles &> /dev/null; then
    echo "❌ pmtiles CLI not found. Installing..."
    # Download latest pmtiles binary
    PMTILES_VERSION="1.29.1"
    ARCH=$(uname -m)
    case $ARCH in
        x86_64) PMTILES_ARCH="x86_64" ;;
        aarch64) PMTILES_ARCH="arm64" ;;
        *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    
    DOWNLOAD_URL="https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${PMTILES_ARCH}.tar.gz"
    echo "📥 Downloading from: $DOWNLOAD_URL"
    
    curl -L "$DOWNLOAD_URL" -o /tmp/pmtiles.tar.gz
    tar -xzf /tmp/pmtiles.tar.gz -C /tmp
    sudo mv /tmp/pmtiles /usr/local/bin/
    rm /tmp/pmtiles.tar.gz
    echo "✅ pmtiles CLI installed"
fi

# Function to download a region
download_region() {
    local region=$1
    local bbox=${REGIONS[$region]}
    
    if [ -z "$bbox" ]; then
        echo "❌ Unknown region: $region"
        echo "Available regions: ${!REGIONS[@]}"
        exit 1
    fi
    
    local output_file="$PMTILES_DIR/${region}.pmtiles"
    
    if [ -f "$output_file" ]; then
        echo "⚠️ Region '$region' already exists. Skipping."
        return
    fi
    
    echo "🌎 Downloading region: $region ($bbox)..."
    echo "   This may take several minutes depending on region size..."
    
    pmtiles extract "$PLANET_URL" "$output_file" --bbox="$bbox"
    
    if [ -f "$output_file" ]; then
        size=$(du -h "$output_file" | cut -f1)
        echo "✅ Downloaded: $region ($size)"
    else
        echo "❌ Failed to download: $region"
        exit 1
    fi
}

# Main
if [ "$#" -eq 0 ]; then
    echo "KEPLER PMTiles Downloader"
    echo "========================="
    echo "Usage: $0 <region> [region2] ..."
    echo ""
    echo "Available regions:"
    for region in "${!REGIONS[@]}"; do
        echo "  - $region"
    done
    echo ""
    echo "Example: $0 venezuela colombia"
    exit 0
fi

# Download requested regions
for region in "$@"; do
    download_region "$region"
done

echo ""
echo "🎉 All regions downloaded to: $PMTILES_DIR"
echo "   Restart the KEPLER server to use vector tiles."

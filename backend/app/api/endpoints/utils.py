from fastapi import APIRouter, Response, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
import httpx
import os
from pathlib import Path

router = APIRouter()

# Directory for PMTiles files
PMTILES_DIR = Path(__file__).parent.parent.parent.parent / "data" / "pmtiles"

@router.get("/tiles/{z}/{x}/{y}.png")
async def proxy_tiles(z: int, x: int, y: int, source: str = "osm"):
    """
    Proxy for map tiles to add Cross-Origin-Resource-Policy header.
    Supports sources: osm, opentopo, esri (satellite)
    """
    # Define sources
    sources = {
        "osm": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "opentopo": "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        "esri": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    }
    
    # Select template
    template = sources.get(source, sources["osm"])
    
    # Subdomain rotation for OSM/Topo
    subdomain = "a" 
    
    # Construct URL
    if "Esri" in template or "arcgisonline" in template:
        url = template.format(z=z, y=y, x=x)
    else:
        url = template.format(s=subdomain, z=z, x=x, y=y)
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            headers = {"User-Agent": "KeplerApp/1.0"}
            resp = await client.get(url, headers=headers, timeout=5.0)
            
            if resp.status_code != 200:
                if source != "osm":
                    return await proxy_tiles(z, x, y, "osm")
                return Response(status_code=resp.status_code)
                
            return Response(
                content=resp.content, 
                media_type="image/png", 
                headers={
                    "Cross-Origin-Resource-Policy": "cross-origin",
                    "Cache-Control": "public, max-age=86400"
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pmtiles/{region}.pmtiles")
async def serve_pmtiles(region: str, request: Request):
    """
    Serve PMTiles files with HTTP Range Request support.
    This enables efficient vector tile loading from a single file.
    """
    # Sanitize region name to prevent path traversal
    safe_region = "".join(c for c in region if c.isalnum() or c in "-_")
    file_path = PMTILES_DIR / f"{safe_region}.pmtiles"
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Region '{region}' not found")
    
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")
    
    # Common headers for CORS
    common_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=604800"  # 1 week cache
    }
    
    if range_header:
        # Parse range header (format: "bytes=start-end")
        try:
            range_spec = range_header.replace("bytes=", "")
            parts = range_spec.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
            
            # Clamp to file size
            end = min(end, file_size - 1)
            length = end - start + 1
            
            def iter_file():
                with open(file_path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk_size = min(8192, remaining)
                        data = f.read(chunk_size)
                        if not data:
                            break
                        remaining -= len(data)
                        yield data
            
            return StreamingResponse(
                iter_file(),
                status_code=206,
                media_type="application/octet-stream",
                headers={
                    **common_headers,
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(length)
                }
            )
        except Exception as e:
            raise HTTPException(status_code=416, detail="Invalid range")
    
    # No range requested - return full file (not recommended for large files)
    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        headers=common_headers
    )


@router.get("/pmtiles/available")
async def list_available_regions():
    """
    List all available PMTiles regions.
    Used by the Settings module to display downloadable regions.
    """
    PMTILES_DIR.mkdir(parents=True, exist_ok=True)
    
    regions = []
    for file in PMTILES_DIR.glob("*.pmtiles"):
        regions.append({
            "id": file.stem,
            "name": file.stem.replace("-", " ").title(),
            "size_mb": round(file.stat().st_size / (1024 * 1024), 1)
        })
    
    return {"regions": regions}

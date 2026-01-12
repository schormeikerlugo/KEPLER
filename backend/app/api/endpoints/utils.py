from fastapi import APIRouter, Response, HTTPException
import httpx

router = APIRouter()

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
        url = template.format(z=z, y=y, x=x) # ESRI uses different order/format sometimes but standard XYZ works usually
    else:
        url = template.format(s=subdomain, z=z, x=x, y=y)
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            # Add user agent to avoid blocking by some tile servers
            headers = {"User-Agent": "KeplerApp/1.0"}
            resp = await client.get(url, headers=headers, timeout=5.0)
            
            if resp.status_code != 200:
                # Fallback to OSM if specific source fails
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
        print(f"Tile proxy error ({source}): {e}")
        # Return transparent 1x1 pixel
        transparent_pixel = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        return Response(content=transparent_pixel, media_type="image/png")

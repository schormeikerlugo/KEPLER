from langchain_core.tools import tool
from .base import get_admin_client
import math

def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    """
    # Convert decimal degrees to radians 
    lat1, lon1, lat2, lon2 = map(math.radians, [float(lat1), float(lon1), float(lat2), float(lon2)])

    # Haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    r = 6371 # Radius of earth in kilometers. Use 3389.5 for Mars if needed.
    return c * r

@tool
def calculate_distance(object_a_name: str, object_b_name: str) -> str:
    """
    Calculates the straight-line distance (geodesic) between two objects identified by their names.
    Use this tool when the user asks "How far is X from Y?", "Distance between A and B", etc.
    Input:
    - object_a_name: Name (or partial name) of the first object.
    - object_b_name: Name (or partial name) of the second object.
    
    Returns: A string with the calculated distance and the full names of the matched objects.
    """
    client = get_admin_client()
    try:
        # Search using RPC 'get_all_objects_with_coords'
        # CONFIRMED Schema: name, lat, lng
        res_a = client.rpc("get_all_objects_with_coords").ilike("name", f"%{object_a_name}%").limit(1).execute()
        if not res_a.data:
            return f"No pude encontrar el objeto '{object_a_name}'."
        
        res_b = client.rpc("get_all_objects_with_coords").ilike("name", f"%{object_b_name}%").limit(1).execute()
        if not res_b.data:
             return f"No pude encontrar el objeto '{object_b_name}'."

        obj_a = res_a.data[0]
        obj_b = res_b.data[0]
        
        # Get Data with confirmed keys
        name_a = obj_a.get('name') or "Objeto A"
        name_b = obj_b.get('name') or "Objeto B"
        
        lat_a = obj_a.get('lat')
        lng_a = obj_a.get('lng')
        lat_b = obj_b.get('lat')
        lng_b = obj_b.get('lng')

        # Fallback to metadata ONLY if RPC returns nulls (unlikely given the view definition, but safe)
        if lat_a is None: lat_a = obj_a.get('metadata', {}).get('location', {}).get('lat')
        if lng_a is None: lng_a = obj_a.get('metadata', {}).get('location', {}).get('lng')

        if lat_a is None or lng_a is None:
             return f"El objeto '{name_a}' existe pero no tiene coordenadas GPS válidas."
        if lat_b is None or lng_b is None:
             return f"El objeto '{name_b}' existe pero no tiene coordenadas GPS válidas."

        # Calculate Distance
        km = haversine(lat_a, lng_a, lat_b, lng_b)
        
        # Format output
        if km < 1:
            dist_str = f"{km * 1000:.1f} metros"
        else:
            dist_str = f"{km:.2f} kilómetros"
            
        return f"La distancia lineal entre '{name_a}' y '{name_b}' es de aproximadamente **{dist_str}**."
        
    except Exception as e:
        return f"Error al calcular distancia: {str(e)}"

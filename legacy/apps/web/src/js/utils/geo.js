export const EARTH_RADIUS = 6371000; // meters

/**
 * Converts a target Lat/Lng to local XYZ coordinates proportional to meters,
 * assuming the user is at (0,0,0) with a specific origin Lat/Lng.
 */
export function gpsToVector(
  userLat,
  userLng,
  targetLat,
  targetLng
) {
  // Convert deg to rad
  const toRad = (val) => (val * Math.PI) / 180;
  
  const dLat = toRad(targetLat - userLat);
  const dLon = toRad(targetLng - userLng);
  
  // Latitude = North/South (Z axis in 3D, inverted because +Z is usually 'out' or 'back')
  // We'll align -Z as North.
  const z = -dLat * EARTH_RADIUS; 
  
  // Longitude = East/West (X axis)
  // Adjust X scale by latitude (cos(lat))
  const x = dLon * EARTH_RADIUS * Math.cos(toRad(userLat));
  
  return [x, 0, z]; // y is altitude (0 for ground level)
}

/**
 * Calculates distance in meters between two coordinates.
 */
export function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;
  
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
    return R * c; // in metres
}

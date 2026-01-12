import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MapPin, Navigation, Sliders, Package, Building2, Users } from 'lucide-react';
import { Database } from '../lib/database.types';

type Donation = Database['public']['Tables']['food_donations']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export function MapView() {
  const { profile } = useAuth();
  const [donations, setDonations] = useState<(Donation & { donor?: Profile; distance?: number })[]>([]);
  const [ngos, setNgos] = useState<Profile[]>([]);
  const [radius, setRadius] = useState(5);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.latitude && profile?.longitude) {
      setUserLocation({ lat: profile.latitude, lng: profile.longitude });
      loadMapData(profile.latitude, profile.longitude);
    } else {
      getCurrentLocation();
    }
  }, [profile, radius]);

  async function getCurrentLocation() {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
        });
      });

      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setUserLocation(location);
      loadMapData(location.lat, location.lng);
    } catch (error) {
      console.error('Error getting location:', error);
      setLoading(false);
    }
  }

  async function loadMapData(lat: number, lng: number) {
    try {
      const { data: donationsData } = await supabase
        .from('food_donations')
        .select('*, donor:profiles!food_donations_donor_id_fkey(*)')
        .in('status', ['available', 'accepted', 'picked_up']);

      const { data: ngosData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'ngo')
        .not('latitude', 'is', null);

      if (donationsData) {
        const donationsWithDistance = await Promise.all(
          donationsData.map(async (donation) => {
            const { data: distance } = await supabase.rpc('calculate_distance', {
              lat1: lat,
              lon1: lng,
              lat2: donation.latitude,
              lon2: donation.longitude,
            });

            return {
              ...donation,
              distance: distance || 0,
            };
          })
        );

        const filteredDonations = donationsWithDistance.filter(
          (d) => d.distance <= radius
        );

        setDonations(filteredDonations);
      }

      if (ngosData) {
        setNgos(ngosData);
      }
    } catch (error) {
      console.error('Error loading map data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleRadiusChange(newRadius: number) {
    setRadius(newRadius);
    if (userLocation) {
      setLoading(true);
      loadMapData(userLocation.lat, userLocation.lng);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!userLocation) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <Navigation className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Location Required</h3>
        <p className="text-gray-500 mb-4">Please enable location access to view the map</p>
        <button
          onClick={getCurrentLocation}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
        >
          Enable Location
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Map View</h1>
          <p className="text-gray-600 mt-1">
            {donations.length} donations within {radius}km
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-3">
          <Sliders className="w-5 h-5 text-gray-600" />
          <select
            value={radius}
            onChange={(e) => handleRadiusChange(parseInt(e.target.value))}
            className="border-none bg-transparent focus:ring-0 font-medium text-gray-900"
          >
            <option value="1">1 km</option>
            <option value="3">3 km</option>
            <option value="5">5 km</option>
            <option value="10">10 km</option>
            <option value="25">25 km</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="relative w-full h-[500px] bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg overflow-hidden">
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
              {Array.from({ length: 64 }).map((_, i) => (
                <div key={i} className="border border-emerald-100/20"></div>
              ))}
            </div>

            {userLocation && (
              <div
                className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: '50%', top: '50%' }}
              >
                <div className="relative">
                  <div className="absolute inset-0 animate-ping">
                    <div
                      className="w-full h-full rounded-full bg-blue-400 opacity-30"
                      style={{
                        width: `${radius * 20}px`,
                        height: `${radius * 20}px`,
                        marginLeft: `-${radius * 10}px`,
                        marginTop: `-${radius * 10}px`,
                      }}
                    ></div>
                  </div>
                  <div className="relative">
                    <div className="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg"></div>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            )}

            {donations.map((donation, index) => {
              const angle = (index * 360) / donations.length;
              const distance = Math.min(donation.distance! / radius, 0.9) * 200;
              const x = 50 + Math.cos((angle * Math.PI) / 180) * distance;
              const y = 50 + Math.sin((angle * Math.PI) / 180) * distance;

              return (
                <div
                  key={donation.id}
                  className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={() => setSelectedMarker(donation.id)}
                >
                  <div
                    className={`relative transition-all ${
                      selectedMarker === donation.id ? 'scale-125' : 'hover:scale-110'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center drop-shadow-lg border-2 border-white ${
                        donation.status === 'completed'
                          ? 'bg-green-500'
                          : donation.status === 'picked_up'
                          ? 'bg-blue-500'
                          : donation.status === 'accepted'
                          ? 'bg-yellow-500'
                          : 'bg-emerald-500'
                      }`}
                    >
                      <Package className="w-5 h-5 text-white" />
                    </div>
                    {donation.urgency_score >= 80 && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    )}
                  </div>
                </div>
              );
            })}

            {ngos.slice(0, 5).map((ngo, index) => {
              const angle = (index * 360) / 5 + 36;
              const x = 50 + Math.cos((angle * Math.PI) / 180) * 150;
              const y = 50 + Math.sin((angle * Math.PI) / 180) * 150;

              return (
                <div
                  key={ngo.id}
                  className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <Building2
                    className="w-6 h-6 text-purple-600 drop-shadow-lg"
                    fill="white"
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-gray-600">Your Location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <span className="text-gray-600">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-gray-600">Accepted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-gray-600">Picked Up</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-600" />
              <span className="text-gray-600">NGOs</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Nearby Donations</h2>
          {donations.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No donations in this area</p>
            </div>
          ) : (
            <div className="space-y-3">
              {donations.map((donation) => (
                <div
                  key={donation.id}
                  className={`bg-white rounded-lg border p-4 cursor-pointer transition-all ${
                    selectedMarker === donation.id
                      ? 'border-emerald-500 shadow-md'
                      : 'border-gray-200 hover:border-emerald-300'
                  }`}
                  onClick={() => setSelectedMarker(donation.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{donation.food_type}</h3>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        donation.urgency_score >= 80
                          ? 'bg-red-100 text-red-700'
                          : donation.urgency_score >= 60
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {donation.urgency_score >= 80 ? 'Urgent' : 'Available'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{donation.quantity}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{donation.distance?.toFixed(1)} km away</span>
                    </div>
                    {donation.donor && (
                      <span className="text-gray-400">{donation.donor.full_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

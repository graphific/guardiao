"use client";

import React, { useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { ArrowLeft, Camera, Map, X, Mic, StopCircle, Trash2 } from 'lucide-react';
import { GoogleMap, LoadScript, Polygon } from '@react-google-maps/api';
import Image from 'next/image';

// Define TypeScript interfaces
interface ButtonProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'ghost' | 'outline';
  onClick?: () => void;
  [key: string]: unknown;
}

/*interface CardProps {
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}*/

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

interface DialogContentProps {
  children: ReactNode;
}

interface Territory {
  name: string;
  area: number;
  coordinates: number[][];
}

interface TerritoryPolygonProps {
  territory: Territory;
  onClick?: () => void;
}

interface GeoJSONFeature {
  properties: {
    name: string;
    area: number;
  };
  geometry: {
    coordinates: number[][][];
  };
}

interface Alert {
  properties: {
    CODEALERTA: string;
    AREAHA: number;
    DATADETEC: string;
  };
  geometry: {
    coordinates: number[][][];
  };
}

interface AlertPolygonProps {
  alert: Alert;
  onClick?: () => void;
}

interface HistoricalImage {
  date: string;
  url: string;
}

interface SampleAlert {
  id: string;
  size: number;
  state: string;
  municipality: string;
  source: string;
  dates: {
    before: string;
    after: string;
    detected: string;
  };
  photos: string[];
  historicalImages: HistoricalImage[];
}

// Simplified Button component
const Button: React.FC<ButtonProps> = ({ children, className = '', variant = 'default', onClick, ...props }) => (
  <button 
    className={`px-4 py-2 rounded-lg ${variant === 'ghost' ? 'hover:bg-gray-100' : 'bg-blue-500 text-white hover:bg-blue-600'} ${className}`}
    onClick={onClick}
    {...props}
  >
    {children}
  </button>
);

// Dialog used for opening Voice Memo or Taking photo at Detailed Alert page
const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full relative">
        <button 
          className="absolute top-2 right-2 p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          onClick={() => onOpenChange(false)}
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
};

const DialogContent: React.FC<DialogContentProps> = ({ children }) => children;


const sampleAlert: SampleAlert = {
  id: "1356062",
  size: 3.20,
  state: "State of Pará",
  municipality: "Santarém",
  source: "Sentinel-2",
  dates: {
    before: "10/02/2024",
    after: "12/03/2024",
    detected: "01/03/2024"
  },
  photos: [
    "/data/close1.jpg",
  ],
  historicalImages: [
    { date: "Feb 2024", url: "/data/1.png" },
    { date: "Mar 2024", url: "/data/2.png" },
    { date: "Apr 2024", url: "/data/3.png" },
  ]
};

const defaultCenter = {
  lat: -4.5,
  lng: -54.5
};

const mapOptions = {
  mapTypeControl: true,
  mapTypeControlOptions: {
    style: 2,
    position: 3,
    mapTypeIds: ['roadmap', 'satellite']
  },
  streetViewControl: false,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    }
  ]
};

function SurveyApp() {
  const [territoriesGeoJSON, setTerritoriesGeoJSON] = useState<GeoJSONFeature[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentView, setCurrentView] = useState<'territories' | 'alerts' | 'alert-details'>('territories');
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedAlert, setSelectedAlert] = useState<SampleAlert | Alert | null>(null);
  const [showPhotoDialog, setShowPhotoDialog] = useState<boolean>(false);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState<number>(5);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [showVoiceNoteDialog, setShowVoiceNoteDialog] = useState<boolean>(false);

  const [sliderPosition, setSliderPosition] = useState<number>(0.5);

  const handleSliderMove = useCallback((e: React.MouseEvent, container: HTMLElement) => {
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSliderPosition(x);
  }, []);

  useEffect(() => {
    async function loadGeoJSON() {
      try {
        const response = await fetch('/data/territories.geojson');
        if (!response.ok) {
          throw new Error('Failed to load territories data');
        }
        const data = await response.json();
        setTerritoriesGeoJSON(data.features);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading GeoJSON:', error);
        setError((error as Error).message);
        setIsLoading(false);
      }
    }
    loadGeoJSON();
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        // Load alerts
        const response = await fetch('/data/maro_alerts.geojson');
        if (!response.ok) {
          throw new Error('Failed to load alerts data');
        }
        const alertsData = await response.json();
        setAlerts(alertsData.features);

        setIsLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setError((error as Error).message);
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    if (selectedTerritory && selectedTerritory.coordinates && typeof google !== 'undefined') {
      try {
        const bounds = new google.maps.LatLngBounds();
        const validCoordinates = selectedTerritory.coordinates.filter(coord => 
          Array.isArray(coord) && 
          coord.length === 2 &&
          typeof coord[0] === 'number' &&
          typeof coord[1] === 'number' &&
          isFinite(coord[0]) &&
          isFinite(coord[1])
        );

        if (validCoordinates.length > 0) {
          validCoordinates.forEach(coord => {
            bounds.extend(new google.maps.LatLng(coord[1], coord[0]));
          });
          const center = {
            lat: (bounds.getNorthEast().lat() + bounds.getSouthWest().lat()) / 2,
            lng: (bounds.getNorthEast().lng() + bounds.getSouthWest().lng()) / 2
          };
          setMapCenter(center);
          setMapZoom(10);
        }
      } catch (error) {
        console.error('Error calculating map bounds:', error);
      }
    }
  }, [selectedTerritory]);
  
  const territories = useMemo<Territory[]>(() =>
    territoriesGeoJSON.map(feature => ({
      name: feature.properties.name,
      area: feature.properties.area,
      coordinates: feature.geometry.coordinates[0]
    })), 
    [territoriesGeoJSON]
  );

  const TerritoriesView: React.FC = React.memo(() => {
    const [isBrowser, setIsBrowser] = useState(false);
    
    useEffect(() => {
      setIsBrowser(true);
    }, []);
    
    if (isLoading) {
      return (
        <div className="h-screen flex items-center justify-center">
          <div className="text-xl text-gray-600">
            <div className="animate-pulse">Loading territories...</div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="h-screen flex items-center justify-center">
          <div className="text-xl text-red-600">Error: {error}</div>
        </div>
      );
    }

    return (
      <div className="h-screen flex flex-col">
        <div className="p-4 bg-primary">
          <h1 className="text-2xl font-semibold text-center text-white">Guardião</h1>
        </div>
        
        <div className="flex-grow flex flex-col">
          {isBrowser && (
            <LoadScript googleMapsApiKey="AIzaSyD0Rx_IfSB385t_-un9MF4IGjE3MYqvOjI">
              <GoogleMap
                mapContainerClassName="flex-grow"
                center={mapCenter}
                zoom={mapZoom}
                options={mapOptions}
              >
                {territories.map((territory, idx) => (
                  <TerritoryPolygon 
                    key={territory.name}
                    territory={territory}
                    onClick={() => {
                      setSelectedTerritory(territories[idx]);
                      setCurrentView('alerts');
                    }}
                  />
                ))}
                
                {alerts.map((alert) => (
                  <AlertPolygon
                    key={alert.properties.CODEALERTA}
                    alert={alert}
                    onClick={() => {
                      setSelectedAlert(alert);
                      setCurrentView('alert-details');
                    }}
                  />
                ))}
              </GoogleMap>
            </LoadScript>
          )}

          <div className="p-4 bg-white shadow-lg">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-2">Alerts</h2>
              <div className="text-sm text-gray-600">
                {alerts.length} deforestation alerts detected
              </div>
            </div>
            {territories.map((territory) => (
              <Button
                key={territory.name}
                variant="outline"
                className="px-4 py-4 rounded-lg bg-blue-500 text-white hover:bg-blue-600 w-full flex items-center justify-center bg-primary text-white hover:bg-primary/80 w-full mb-2 justify-between py-4 border-primary hover:bg-primary hover:text-white"
                onClick={() => {
                  setSelectedTerritory(territory);
                  setCurrentView('alerts');
                }}
              >
                <span>{territory.name}</span>
                <span>({territory.area.toLocaleString()} ha)</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  });

  TerritoriesView.displayName = 'TerritoriesView';

  const TerritoryPolygon: React.FC<TerritoryPolygonProps> = React.memo(({ territory, onClick }) => {
    const paths = useMemo(() =>
      territory.coordinates
        .filter(coord => 
          Array.isArray(coord) && 
          coord.length === 2 &&
          typeof coord[0] === 'number' &&
          typeof coord[1] === 'number' &&
          isFinite(coord[0]) &&
          isFinite(coord[1])
        )
        .map(coord => ({
          lat: coord[1],
          lng: coord[0]
        })),
      [territory]
    );

    return (
      <Polygon
        paths={paths}
        options={{
          fillColor: "transparent",
          fillOpacity: 0,
          strokeColor: "#ac6eee",
          strokeWeight: 2
        }}
        onClick={onClick}
      />
    );
  });
  
  TerritoryPolygon.displayName = 'TerritoryPolygon';

  const AlertsView: React.FC = React.memo(() => {
    const [isBrowser, setIsBrowser] = useState(false);
    
    useEffect(() => {
      setIsBrowser(true);
    }, []);
    
    return (
      <div className="h-screen flex flex-col bg-white">
        <div className="p-4 border-b flex items-center bg-primary">
          <Button variant="ghost" className="text-white hover:bg-white hover:text-primary" onClick={() => setCurrentView('territories')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold ml-2 text-white">{selectedTerritory?.name}</h1>
        </div>
        
        <div className="flex-grow">
          <div className="relative h-1/2">
            {isBrowser && (
              <LoadScript googleMapsApiKey="AIzaSyD0Rx_IfSB385t_-un9MF4IGjE3MYqvOjI">
                <GoogleMap
                  mapContainerClassName="w-full h-full"
                  center={mapCenter}
                  zoom={mapZoom}
                  options={mapOptions}
                >
                  {selectedTerritory && <TerritoryPolygon territory={selectedTerritory} />}

                  {alerts.map((alert) => (
                    <AlertPolygon
                      key={alert.properties.CODEALERTA}
                      alert={alert}
                      onClick={() => {
                        setSelectedAlert(alert);
                        setCurrentView('alert-details');
                      }}
                    />
                  ))}
                </GoogleMap>
              </LoadScript>
            )}
          </div>
          
          <div className="p-4">
          <h2 className="font-semibold mb-3">Active Alerts</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left font-semibold">Alert ID</th>
                <th className="text-left font-semibold">Status</th>
                <th className="text-left font-semibold">Size (ha)</th>
                <th className="text-left font-semibold">Detected</th>
              </tr>
            </thead>
            <tbody>
              <tr
                key={sampleAlert.id}
                className="cursor-pointer hover:bg-primary duration-200"
                onClick={() => {
                  setSelectedAlert(sampleAlert);
                  setCurrentView('alert-details');
                }}
              >
                <td className="px-4 py-2">#{sampleAlert.id}</td>
                <td className="px-4 py-2 text-red-500">Ongoing</td>
                <td className="px-4 py-2">{sampleAlert.size}</td>
                <td className="px-4 py-2">{sampleAlert.dates.detected}</td>
              </tr>
              {alerts.map((alert) => (
                <tr
                  key={alert.properties.CODEALERTA}
                  className="cursor-pointer hover:bg-primary duration-200"
                  onClick={() => {
                    setSelectedAlert(alert);
                    setCurrentView('alert-details');
                  }}
                >
                  <td className="px-4 py-2">#{alert.properties.CODEALERTA}</td>
                  <td className="px-4 py-2 text-red-500"></td>
                  <td className="px-4 py-2">{alert.properties.AREAHA}</td>
                  <td className="px-4 py-2">{alert.properties.DATADETEC}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    );
  });

  AlertsView.displayName = 'AlertsView';

  const AlertPolygon: React.FC<AlertPolygonProps> = React.memo(({ alert, onClick }) => {
    const paths = useMemo(() =>
      alert.geometry.coordinates[0]
        .filter(coords => 
          Array.isArray(coords) && 
          coords.length === 2 &&
          typeof coords[0] === 'number' &&
          typeof coords[1] === 'number' &&
          isFinite(coords[0]) &&
          isFinite(coords[1])
        )
        .map(coords => ({
          lat: coords[1],
          lng: coords[0]
        })),
      [alert]
    );

    return (
      <Polygon
        paths={paths}
        options={{
          fillColor: "transparent",
          fillOpacity: 0,
          strokeColor: "#FF0000",
          strokeWeight: 2
        }}
        onClick={onClick}
      />
    );
  });

  AlertPolygon.displayName = 'AlertPolygon';

  const AlertDetailsView: React.FC = React.memo(() => (
    <div className="h-screen flex flex-col bg-white">
      <div className="p-4 border-b flex items-center bg-primary">
        <Button variant="ghost" className="text-white hover:bg-white hover:text-primary" onClick={() => setCurrentView('alerts')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold ml-2 text-white">Alert Details</h1>
      </div>

      <div className="flex-grow overflow-y-auto">
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-gray-600">Code</div>
              <div>{sampleAlert.id}</div>
            </div>
            <div>
              <div className="text-gray-600">Area</div>
              <div>{sampleAlert.size} ha</div>
            </div>
            <div>
              <div className="text-gray-600">State</div>
              <div>{sampleAlert.state}</div>
            </div>
            <div>
              <div className="text-gray-600">Municipality</div>
              <div>{sampleAlert.municipality}</div>
            </div>
            <div>
              <div className="text-gray-600">Source</div>
              <div>{sampleAlert.source}</div>
            </div>
          </div>

          <div 
            className="relative h-64 mb-4 overflow-hidden cursor-ew-resize"
            onMouseDown={(e) => {
              const container = e.currentTarget;
              handleSliderMove(e, container);

              const handleMouseMove = (moveEvent: MouseEvent) => {
                moveEvent.preventDefault();
                handleSliderMove(moveEvent as unknown as React.MouseEvent, container);
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="absolute inset-0">
              <Image 
                src="/data/after.jpg"
                alt="After"
                className="object-cover"
                draggable={false}
                fill
              />
            </div>
            <div 
              className="absolute inset-0"
              style={{
                clipPath: `inset(0 ${100 - (sliderPosition * 100)}% 0 0)`
              }}
            >
              <Image 
                src="/data/before.jpg"
                alt="Before"
                className="object-cover"
                draggable={false}
                fill
              />
            </div>
            <div 
              className="absolute inset-y-0 w-1 bg-white"
              style={{
                left: `${sliderPosition * 100}%`,
              }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-primary text-white rounded-full shadow-lg flex items-center justify-center">
                <div>↔</div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-medium mb-2">Historical Timeline</h3>
            <div className="grid grid-cols-1 gap-2">
              {sampleAlert.historicalImages.map((image, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="relative w-24 h-24">
                    <Image 
                      src={image.url}
                      alt={`Historical image ${image.date}`}
                      className="object-cover rounded"
                      fill
                    />
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{image.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div>Before: {sampleAlert.dates.before}</div>
              <div>Detected: {sampleAlert.dates.detected}</div>
            </div>
            <div>
              <div>After: {sampleAlert.dates.after}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Button 
              className="w-full flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/80"
              onClick={() => {}}
            >
              <Map className="h-4 w-4" />
              Plot Route
            </Button>
            <Button 
              className="w-full flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/80"
              onClick={() => setShowPhotoDialog(true)}
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </Button>
            <Button 
              className="w-full flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/80"
              onClick={() => setShowVoiceNoteDialog(true)}
            >
              <Mic className="h-4 w-4" />
              Add Voice Note
            </Button>
          </div>
        </div>
      </div>
    </div>
  ));

  AlertDetailsView.displayName = 'AlertDetailsView';

  return (
    <div className="max-w-md mx-auto border h-screen">
      {currentView === 'territories' && <TerritoriesView />}
      {currentView === 'alerts' && <AlertsView />}
      {currentView === 'alert-details' && <AlertDetailsView />}
      
      {/* Photo Dialog */}
      <Dialog open={showPhotoDialog} onOpenChange={setShowPhotoDialog}>
        <DialogContent>
          <div className="p-4 pt-6">
            <h2 className="font-semibold mb-4 text-primary dark:text-primary">Photos</h2>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {sampleAlert.photos.map((photo, index) => (
                <div key={index} className="relative w-full aspect-square">
                  <Image 
                    src={photo}
                    alt={`Photo ${index + 1}`}
                    className="object-cover rounded"
                    fill
                  />
                </div>
              ))}
            </div>
            <Button 
              className="w-full flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/80"
              onClick={() => {}}
            >
              <Camera className="h-4 w-4" />
              Take New Photo
            </Button>
            <Button 
              className="w-full mt-2 flex items-center justify-center gap-2"
              onClick={() => setShowPhotoDialog(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice Note Dialog */}
      <Dialog open={showVoiceNoteDialog} onOpenChange={setShowVoiceNoteDialog}>
        <DialogContent>
          <div className="p-4 pt-6">
            <h2 className="font-semibold mb-4 text-primary dark:text-primary">Voice Note</h2>
            <div className="flex justify-center mb-4">
              {isRecording ? (
                <button
                  className="p-4 rounded-full bg-red-500 text-white"
                  onClick={() => setIsRecording(false)}
                >
                  <StopCircle className="h-12 w-12" />
                </button>
              ) : (
                <button
                  className="p-4 rounded-full bg-primary text-white"
                  onClick={() => setIsRecording(true)}
                >
                  <Mic className="h-12 w-12" />
                </button>
              )}
            </div>
            <div className="flex justify-between">
              <div className="text-gray-600 dark:text-gray-400">
                {isRecording ? 'Recording...' : 'Tap to record'}
              </div>
              {!isRecording && (
                <button
                  className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                  onClick={() => {}}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
            <Button 
              className="w-full mt-4 flex items-center justify-center gap-2"
              onClick={() => setShowVoiceNoteDialog(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SurveyApp;
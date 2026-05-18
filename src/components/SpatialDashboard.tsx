import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, Marker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { collection } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useUnifiedData } from '../services/unifiedDataService';
import { motion, AnimatePresence } from 'motion/react';
import { Filter, Info, Map as MapIcon, Database, CheckCircle2, AlertCircle, Clock, ChevronDown, Search, X } from 'lucide-react';
import L from 'leaflet';

// Fix Leaflet icon issue
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom invisible icon for labels
const labelIcon = (text: string, subtext: string) => L.divIcon({
  className: 'custom-map-label',
  html: `<div class="flex flex-col items-center pointer-events-none drop-shadow-xl">
          <span class="bg-slate-950/90 backdrop-blur-md text-white font-black text-[10px] px-3 py-1 rounded-lg shadow-2xl border border-white/20 whitespace-nowrap leading-none tracking-tight">${text}</span>
          <span class="bg-primary-600 text-white font-black text-[9px] px-2 mt-1 rounded-md border border-primary-400 shadow-lg shadow-primary-500/30">${subtext}%</span>
         </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0]
});

interface SLSData {
  idsubsls: string;
  idsls?: string;
  nmsls: string;
  nmdesa?: string;
  nmkec?: string;
  target: number;
  realisasi: number;
  lastUpdate?: any;
}

interface AggregatedStats {
  target: number;
  realisasi: number;
  count: number;
}

type MapLevel = 'kec' | 'desa' | 'sls';

// Cache for GeoJSON data to prevent redundant fetches
const GEO_CACHE: Record<string, any> = {};

// Compute centroid from geometry coordinates (replaces expensive L.geoJSON per feature)
function computeCentroid(feature: any): [number, number] | null {
  if (!feature?.geometry) return null;
  try {
    let coords: number[][];
    if (feature.geometry.type === 'Polygon') {
      coords = feature.geometry.coordinates[0];
    } else if (feature.geometry.type === 'MultiPolygon') {
      // Use the largest polygon ring
      coords = feature.geometry.coordinates
        .reduce((largest: number[][], poly: number[][][]) =>
          poly[0].length > largest.length ? poly[0] : largest,
          feature.geometry.coordinates[0][0]
        );
    } else {
      return null;
    }
    if (!coords || coords.length === 0) return null;
    let sumLng = 0, sumLat = 0;
    for (const c of coords) {
      sumLng += c[0];
      sumLat += c[1];
    }
    return [sumLat / coords.length, sumLng / coords.length];
  } catch {
    return null;
  }
}

// Build a prefix-based lookup map for O(1) aggregated stats
function buildSlsLookup(slsData: Record<string, SLSData>): Map<string, AggregatedStats> {
  const map = new Map<string, AggregatedStats>();
  Object.values(slsData).forEach(item => {
    if (!item.idsubsls) return;
    const id = item.idsubsls;
    // Build prefix sums for kec (7), desa (10), sls (14+) levels
    const prefixLengths = new Set([7, 10, 14, id.length]);
    prefixLengths.forEach(len => {
      if (len > id.length) return;
      const prefix = id.substring(0, len);
      const existing = map.get(prefix);
      if (existing) {
        existing.target += item.target || 0;
        existing.realisasi += item.realisasi || 0;
        existing.count++;
      } else {
        map.set(prefix, { target: item.target || 0, realisasi: item.realisasi || 0, count: 1 });
      }
    });
  });
  return map;
}

// Component to handle auto-fitting bounds based on filtered features
function MapBoundsFit({ features }: { features: any[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (features && features.length > 0) {
      try {
        const layer = L.geoJSON({ type: 'FeatureCollection', features } as any);
        map.fitBounds(layer.getBounds(), { padding: [40, 40], animate: true });
      } catch (e) {
        console.error("Error fitting bounds:", e);
      }
    }
  }, [features, map]);

  return null;
}

// Component to mask outside area
function MapMask({ features }: { features: any[] }) {
  if (!features || features.length === 0) return null;
  
  // Create a world boundary with a hole (the focused area)
  // World bounds: [[-90, -180], [-90, 180], [90, 180], [90, -180]]
  const worldLatLngs = [
    L.latLng(-90, -180),
    L.latLng(-90, 180),
    L.latLng(90, 180),
    L.latLng(90, -180)
  ];

  try {
    const geo = L.geoJSON({ type: 'FeatureCollection', features } as any);
    const bounds = geo.getBounds();
    
    // We want the mask to be consistent even when drilling
    // Instead of using just "features" which changes on drill, we should use a broad boundary.
    // However, for now let's just make the existing features the "hole"
    return (
      <GeoJSON 
        key="global-mask"
        data={{
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
              ...features.flatMap(f => {
                if (f.geometry.type === 'Polygon') return f.geometry.coordinates;
                if (f.geometry.type === 'MultiPolygon') return f.geometry.coordinates.flat(1);
                return [];
              })
            ]
          }
        } as any}
        style={{
          fillColor: '#000000',
          fillOpacity: 0.8,
          color: 'transparent',
          weight: 0,
          interactive: false
        }}
      />
    );
  } catch (e) {
    return null;
  }
}

export function SpatialDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const { slsList } = useUnifiedData();
  
  const slsData = useMemo(() => {
    const data: Record<string, SLSData> = {};
    slsList.forEach(item => {
      data[item.idsubsls || item.idsls || item.id] = item;
    });
    return data;
  }, [slsList]);

  const [mapLevel, setMapLevel] = useState<MapLevel>('kec');
  const [geoData, setGeoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  
  // Filters
  const [selKec, setSelKec] = useState<string>('ALL');
  const [selDesa, setSelDesa] = useState<string>('ALL');
  const [selSLS, setSelSLS] = useState<string>('ALL');
  
  // Add a trigger state to force map re-renders when data arrives
  const [lastDataUpdate, setLastDataUpdate] = useState(Date.now());

  useEffect(() => {
    setLastDataUpdate(Date.now()); // Trigger re-render whenever slsList changes
  }, [slsList]);

  // Fetch GeoJSON with caching
  useEffect(() => {
    const fetchGeo = async () => {
      setLoading(true);
      const fileName = `/maps/peta_${mapLevel}_202511208.geojson`;
      
      if (GEO_CACHE[mapLevel]) {
        setGeoData(GEO_CACHE[mapLevel]);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(fileName);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        GEO_CACHE[mapLevel] = data;
        setGeoData(data);
      } catch (err) {
        console.error('Failed to load GeoJSON:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchGeo();
  }, [mapLevel]);

function getFeatureId(p: any, level: MapLevel) {
  if (!p) return null;
  
  if (level === 'kec') {
      const id = p.idkec || p.id_kec || p.IDKEC || p.idsubsls || p.idsls || '';
      return id.toString().substring(0, 7);
  }
  
  if (level === 'desa') {
      const id = p.iddesa || p.id_desa || p.IDDESA || p.idsubsls || p.idsls || '';
      return id.toString().substring(0, 10);
  }

  // SLS level: capture full ID (14 or 16 digits)
  const id = p.idsubsls || p.idsls || p.IDSLS || p.ID_SLS || p.id_sls || '';
  return id.toString().replace(/\D/g, '');
}

// Helper to find data by searching up the hierarchy (Only for SLS: 16 -> 14)
function getEffectiveStats(id: string | null, lookup: Map<string, AggregatedStats>) {
  if (!id) return { target: 0, realisasi: 0, count: 0 };
  if (lookup.has(id)) return lookup.get(id)!;
  
  // Only SLS (14+) can fall back to its parent SLS (14)
  if (id.length > 14) {
    const parentId = id.substring(0, 14);
    if (lookup.has(parentId)) return lookup.get(parentId)!;
  }
  
  return { target: 0, realisasi: 0, count: 0 };
}

function getFeatureName(p: any, level: MapLevel) {
  if (level === 'sls') return p.nmsubsls || p.nmsls;
  if (level === 'desa') return p.nmdesa;
  if (level === 'kec') return p.nmkec;
  return 'N/A';
}

function getTrueTarget(agg: any, level: MapLevel) {
  let realTarget = agg.target;
  if (level === 'kec') realTarget = Math.max(realTarget, 6000);
  else if (level === 'desa') realTarget = Math.max(realTarget, 600);
  else if (level === 'sls') realTarget = Math.max(realTarget, 100);
  return realTarget;
}

// Component to render labels on map
function LabelLayer({ features, lookup, mapLevel }: { features: any[], lookup: Map<string, AggregatedStats>, mapLevel: MapLevel }) {
  // Use a map to ensure we only render one label per unique ID to avoid duplicates
  const uniqueFeaturesMap: Record<string, any> = {};
  features.forEach(f => {
    const id = getFeatureId(f.properties, mapLevel);
    if (id && !uniqueFeaturesMap[id]) {
      uniqueFeaturesMap[id] = f;
    }
  });

  const uniqueList = Object.values(uniqueFeaturesMap);

  return (
    <>
      {uniqueList.map((f: any, idx: number) => {
        const id = getFeatureId(f.properties, mapLevel);
        const name = getFeatureName(f.properties, mapLevel);
        
        // Use hierarchical lookup (16 -> 14 -> 10 -> 7)
        const stats = getEffectiveStats(id, lookup);
        const realTarget = getTrueTarget(stats, mapLevel);
        const percent = realTarget > 0 ? (stats.realisasi / realTarget) * 100 : 0;

        // Use pure math centroid instead of expensive L.geoJSON()
        const center = computeCentroid(f);
        if (!center) return null;

        return (
          <Marker 
            key={`label-${id}-${mapLevel}-${idx}`} 
            position={center} 
            icon={labelIcon(name || 'N/A', percent.toFixed(0))}
            interactive={false}
          />
        );
      })}
    </>
  );
}

// Derived filtered features and option lists
  const { filteredFeatures, kecOptions, desaOptions, slsOptions, names } = useMemo(() => {
    const kecsMap = new Map<string, string>();
    const desasMap = new Map<string, string>();
    const slssMap = new Map<string, string>();

    // 1. Build Options and Name Maps mapping IDs to names
    const allUnits = Object.values(slsData) as SLSData[];
    
    // First pass: identify all unique IDs from slsData
    allUnits.forEach(item => {
        if (!item.idsubsls) return;
        
        const idK = item.idsubsls.substring(0, 7);
        const idD = item.idsubsls.substring(0, 10);
        const idS = item.idsubsls.substring(0, 14);

        // Try to extract names from nmsls (format: "Kec - Desa - SLS")
        if (item.nmsls) {
            const parts = item.nmsls.split(' - ');
            if (parts.length >= 1 && !kecsMap.has(idK)) kecsMap.set(idK, parts[0]);
            if (parts.length >= 2 && !desasMap.has(idD)) desasMap.set(idD, parts[1]);
            if (parts.length >= 3 && !slssMap.has(idS)) slssMap.set(idS, parts[2]);
            else slssMap.set(idS, parts[parts.length - 1]);
        }
        
        // Secondary sources for names
        if (item.nmdesa && !desasMap.has(idD)) desasMap.set(idD, item.nmdesa);
    });

    // Fallback: If kecsMap is still sparse, try to get names from geoData if available
    if (geoData?.features) {
        geoData.features.forEach((f: any) => {
            const p = f.properties;
            const idK = getFeatureId(p, 'kec');
            const nmK = p.nmkec;
            const idD = getFeatureId(p, 'desa');
            const nmD = p.nmdesa;
            const idS = getFeatureId(p, 'sls');
            const nmS = p.nmsubsls || p.nmsls;

            if (idK && nmK && !kecsMap.has(idK)) kecsMap.set(idK, nmK);
            if (idD && nmD && !desasMap.has(idD)) desasMap.set(idD, nmD);
            if (idS && nmS && !slssMap.has(idS)) slssMap.set(idS, nmS);
        });
    }

    const kOptions = Array.from(kecsMap.entries())
        .filter(([id]) => id && id.length >= 7)
        .sort((a,b) => a[1].localeCompare(b[1])) as [string, string][];
    
    const dOptions = Array.from(desasMap.entries())
        .filter(([id]) => id && id.length >= 10 && (selKec === 'ALL' || id.startsWith(selKec)))
        .sort((a,b) => a[1].localeCompare(b[1])) as [string, string][];
    
    const sOptions = Array.from(slssMap.entries())
        .filter(([id]) => id && id.length >= 14 && (selDesa === 'ALL' || id.startsWith(selDesa)))
        .sort((a,b) => a[1].localeCompare(b[1])) as [string, string][];

    const currentNames = {
        kec: selKec !== 'ALL' ? (kecsMap.get(selKec) || 'Kecamatan') : 'Kecamatan',
        desa: selDesa !== 'ALL' ? (desasMap.get(selDesa) || 'Desa') : 'Desa',
        sls: selSLS !== 'ALL' ? (slssMap.get(selSLS) || 'SLS') : 'SLS'
    };

    if (!geoData || !geoData.features) {
      return { 
        filteredFeatures: [], 
        kecOptions: kOptions, 
        desaOptions: dOptions, 
        slsOptions: sOptions, 
        names: currentNames
      };
    }

    // 2. Filter features based on selection
    const features = geoData.features.filter((f: any) => {
      const p = f.properties;
      const idK = getFeatureId(p, 'kec');
      const idD = getFeatureId(p, 'desa');
      const idS = getFeatureId(p, 'sls');
      
      if (selSLS !== 'ALL') return idS === selSLS;
      if (selDesa !== 'ALL') return idD === selDesa;
      if (selKec !== 'ALL') return idK === selKec;
      return true;
    });

    return { 
      filteredFeatures: features, 
      kecOptions: kOptions, 
      desaOptions: dOptions, 
      slsOptions: sOptions, 
      names: currentNames
    };
  }, [geoData, selKec, selDesa, selSLS, slsData, mapLevel]);

  // Pre-compute lookup map — memoized so it only recalculates when slsData changes
  const slsLookup = useMemo(() => buildSlsLookup(slsData), [slsData]);

  // Ref to hold the latest lookup for stale closures
  const slsLookupRef = useRef(slsLookup);
  useEffect(() => {
    slsLookupRef.current = slsLookup;
  }, [slsLookup]);

  // Ref to access the GeoJSON instance directly for forced style updates
  const geoJsonRef = useRef<any>(null);

  // Force Leaflet to re-style when data changes, bypassing React render lag
  // Force Leaflet to re-style when data changes, bypassing React render lag
  useEffect(() => {
    if (geoJsonRef.current) {
      try {
        geoJsonRef.current.setStyle(mapStyle);
      } catch (e) {
        // Ignore if layer is not ready
      }
    }
  }, [slsData, mapLevel, geoData]);

  const stats = useMemo(() => {
    let t = 0, c = 0, pCount = 0, cr = 0, ns = 0;
    const features = filteredFeatures;
    const lookup = slsLookup;
    features.forEach((f: any) => {
      const id = getFeatureId(f.properties, mapLevel);
      const agg = getEffectiveStats(id, lookup);
      const realTarget = getTrueTarget(agg, mapLevel);
      const percent = realTarget > 0 ? (agg.realisasi / realTarget) * 100 : 0;

      t++;
      if (percent >= 100) c++;
      else if (percent >= 50) pCount++;
      else cr++;
    });

    return { 
      total: t, 
      completed: c, 
      good: pCount, 
      warning: 0, 
      critical: cr, 
      notStarted: 0 
    };
  }, [filteredFeatures, slsLookup, mapLevel]);

  const getColor = (percent: number, hasData: boolean) => {
    if (!hasData) return '#475569'; // Slate-600 for no data
    if (percent >= 100) return '#10b981'; // Emerald-500 (Tuntas)
    if (percent >= 50) return '#3b82f6'; // Blue-500 (On Progress)
    return '#f43f5e'; // Rose-500 (Critical)
  };

  const mapStyle = (feature: any) => {
    const id = getFeatureId(feature.properties, mapLevel);
    // Use hierarchical lookup with ref to handle stale closures
    const agg = getEffectiveStats(id, slsLookupRef.current);
    const realTarget = getTrueTarget(agg, mapLevel);
    const percent = realTarget > 0 ? (agg.realisasi / realTarget) * 100 : 0;
    
    return {
      fillColor: getColor(percent, agg.count > 0),
      weight: 1,
      opacity: 0.5,
      color: '#ffffff',
      fillOpacity: 0.65
    };
  };

  const onEachFeature = (feature: any, layer: any) => {
    const props = feature.properties;
    const id = getFeatureId(props, mapLevel);
    const name = getFeatureName(props, mapLevel);
    
    layer.on({
      mouseover: (e: any) => {
        const l = e.target;
        l.setStyle({ fillOpacity: 0.9, weight: 2, color: '#3b82f6' });
      },
      mouseout: (e: any) => {
        const l = e.target;
        l.setStyle(mapStyle(feature));
      },
      click: () => {
          if (id) {
            if (mapLevel === 'kec') {
                setSelKec(id);
                setMapLevel('desa');
            } else if (mapLevel === 'desa') {
                setSelDesa(id);
                setMapLevel('sls');
            }
          }
      }
    });

    layer.bindPopup(() => {
        if (!id) return 'No ID info';
        const agg = getEffectiveStats(id, slsLookup);
        const realTarget = getTrueTarget(agg, mapLevel);
        const percent = realTarget > 0 ? (agg.realisasi / realTarget) * 100 : 0;

        return `
          <div class="p-3 min-w-[200px] font-sans glass-card border-none bg-white/95">
            <h3 class="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-2 flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
              ${name}
            </h3>
            <div class="space-y-1.5 text-[11px]">
              <div class="flex justify-between text-slate-500"><span>ID Wilayah:</span> <span class="font-mono text-slate-700">${id}</span></div>
              <div class="flex justify-between text-slate-500"><span>Target:</span> <span class="font-bold text-slate-900">${realTarget}</span></div>
              <div class="flex justify-between text-slate-500"><span>Realisasi:</span> <span class="font-bold text-primary-600">${agg.realisasi}</span></div>
              <div class="mt-3 pt-2">
                <div class="flex justify-between mb-1.5">
                  <span class="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Pencapaian</span>
                  <span class="font-bold text-primary-700">${percent.toFixed(1)}%</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-primary-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style="width: ${Math.min(percent, 100)}%"></div>
                </div>
              </div>
              <div class="mt-4 pt-2 border-t border-slate-50 text-center text-[10px] text-slate-400 italic font-medium">
                 Double-tap / Klik untuk detail level wilayah
              </div>
            </div>
          </div>
        `;
    });
  };

  return (
    <div className={`flex flex-col bg-slate-50 overflow-hidden relative transition-all duration-500 ${isMaximized ? 'fixed inset-0 z-[9999] w-screen h-screen' : 'h-[750px] rounded-3xl shadow-lg border border-slate-200'}`} id="spatial-dashboard">
      {/* Map Surface */}
      <div className="flex-1 relative order-1">
        <MapContainer
          center={[2.91, 99.62]}
          zoom={10}
          className="h-full w-full"
          zoomControl={false}
          style={{ background: '#0f172a' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
            opacity={1}
          />
          
          <MapMask features={geoData?.features || []} />
          

          
          <MapBoundsFit features={filteredFeatures} />
          
          <AnimatePresence mode='wait'>
            {!loading && filteredFeatures.length > 0 && (
              <>
                <GeoJSON 
                  ref={geoJsonRef}
                  key={`${mapLevel}-${selKec}-${selDesa}-${selSLS}-${lastDataUpdate}-${geoData?.features.length || 0}`} 
                  data={{ type: 'FeatureCollection', features: filteredFeatures } as any} 
                  style={mapStyle} 
                  onEachFeature={onEachFeature} 
                />
                {showLabels && (
                  <LabelLayer 
                      features={filteredFeatures} 
                      lookup={slsLookup} 
                      mapLevel={mapLevel} 
                  />
                )}
              </>
            )}
          </AnimatePresence>

          {/* Map Controls */}
          <div className="absolute bottom-8 left-8 z-[1000] flex flex-col gap-3">
            <button 
              onClick={() => setIsMaximized(!isMaximized)}
              className="bg-slate-900/80 backdrop-blur-md px-5 py-3 rounded-xl shadow-xl border border-white/10 text-white hover:bg-slate-800 transition-all flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest"
            >
              {isMaximized ? "Minimize View" : "Fullscreen View"}
            </button>
            <button 
              onClick={() => setShowLabels(!showLabels)}
              className={`px-5 py-3 rounded-xl shadow-xl border backdrop-blur-md flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest transition-all ${showLabels ? 'bg-primary-600 text-white border-primary-500' : 'bg-slate-900/80 text-white border-white/10 hover:bg-slate-800'}`}
            >
              {showLabels ? "Hide Labels" : "Show Labels"}
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-10 right-10 z-[1000]">
            <div className="glass-card p-8 rounded-[2rem] border-white/40">
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-2 h-5 bg-primary-600 rounded-full shadow-lg shadow-primary-500/50"></div>
                 <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.15em]">Heatmap Legend</h3>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Tuntas (≥ 100%)", color: '#10b981', glow: 'shadow-emerald-500/50' },
                  { label: "Progres (50 - 99%)", color: '#3b82f6', glow: 'shadow-blue-500/50' },
                  { label: "Kritis (< 50%)", color: '#f43f5e', glow: 'shadow-rose-500/50' },
                  { label: "Belum Ada Data", color: '#475569', glow: 'shadow-slate-500/50' }
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-4 group">
                    <div className={`w-4 h-4 rounded-lg shadow-lg border-2 border-white/50 transition-transform group-hover:scale-110 ${item.glow}`} style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="absolute top-6 right-6 z-[1000] w-64 pointer-events-none">
            <AnimatePresence>
              {!loading && (
                <motion.div 
                   initial={{ opacity: 0, y: -10 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="glass-card p-6 rounded-2xl bg-white/95 pointer-events-auto space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Database className="text-primary-500" size={18} />
                        <h3 className="font-bold text-slate-800 text-[12px] uppercase tracking-widest">Overview</h3>
                    </div>
                    <div className="px-2.5 py-1 bg-emerald-50 rounded text-[9px] font-bold text-emerald-600 border border-emerald-100 uppercase animate-pulse">LIVE</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <SummaryCard label={`JML ${mapLevel}`} value={stats.total} color="slate" />
                    <SummaryCard 
                        label="TUNTAS" 
                        value={stats.completed} 
                        color="emerald" 
                        sub={`${stats.total > 0 ? Math.round((stats.completed/stats.total)*100) : 0}%`} 
                    />
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <ProgressRow label="Progress Baik" value={stats.good} color="text-primary-600" bg="bg-primary-500" />
                    <ProgressRow label="Kritis" value={stats.critical} color="text-rose-600" bg="bg-rose-500" />
                    <ProgressRow label="Belum Lapor" value={stats.notStarted} color="text-slate-400" bg="bg-slate-300" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </MapContainer>

        {loading && (
          <div className="absolute inset-0 z-[5000] bg-slate-950/60 backdrop-blur-md flex items-center justify-center">
            <div className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin shadow-lg shadow-primary-500/20"></div>
              <div className="text-center">
                <p className="text-primary-400 font-bold animate-pulse uppercase tracking-[0.3em] text-[12px] mb-2">Syncing Spatial Data</p>
                <p className="text-slate-400 text-[10px] uppercase tracking-widest font-semibold">Memuat database pemetaan...</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search & Navigation Panel */}
      <div className="absolute top-6 left-6 z-[6000] pointer-events-auto transition-all duration-300">
        <AnimatePresence mode="wait">
          {isMenuOpen ? (
            <motion.div 
              key="panel"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="glass-card p-6 rounded-2xl bg-white/95 w-[340px] relative"
            >
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-all"
              >
                <X size={16} />
              </button>
              <div className="flex items-center gap-4 border-b border-slate-100 pb-6 pr-8">
                <div className="p-3 bg-primary-600 rounded-2xl text-white shadow-lg shadow-primary-500/30">
                    <MapIcon size={22} />
                </div>
                <div>
                   <h2 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest leading-none">Spatial Heatmap</h2>
                   <p className="text-[10px] text-primary-600 font-bold uppercase mt-1.5 tracking-wider">Kabupaten Asahan</p>
                </div>
              </div>

            <div className="space-y-6 pt-6">
                {/* Visual Path / Breadcrumbs */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-[10px] font-bold uppercase tracking-widest">
                        <button 
                            onClick={() => { setSelKec('ALL'); setSelDesa('ALL'); setSelSLS('ALL'); setMapLevel('kec'); }}
                            className="text-primary-600 hover:text-primary-800 transition-colors whitespace-nowrap"
                        >
                            ROOT
                        </button>
                        <span className="text-slate-300">/</span>
                        <button 
                            disabled={selKec === 'ALL'}
                            onClick={() => { setSelDesa('ALL'); setSelSLS('ALL'); setMapLevel('desa'); }}
                            className={`${selKec !== 'ALL' ? 'text-primary-600 hover:text-primary-800' : 'text-slate-400'} whitespace-nowrap`}
                        >
                            {names.kec}
                        </button>
                        {selDesa !== 'ALL' && (
                            <>
                                <span className="text-slate-300">/</span>
                                <button 
                                    onClick={() => { setSelSLS('ALL'); setMapLevel('sls'); }}
                                    className="text-slate-600 hover:text-primary-600 whitespace-nowrap transition-colors"
                                >
                                    {names.desa}
                                </button>
                            </>
                        )}
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">View Level:</span>
                        <div className="flex gap-1.5">
                            {(['kec', 'desa', 'sls'] as MapLevel[]).map(lvl => (
                                <button 
                                    key={lvl}
                                    onClick={() => setMapLevel(lvl)}
                                    className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase transition-all ${mapLevel === lvl ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <FilterDropdown 
                        label="Kecamatan" 
                        value={selKec} 
                        options={kecOptions} 
                        onChange={(v) => { 
                            setSelKec(v); 
                            setSelDesa('ALL'); 
                            setSelSLS('ALL'); 
                            if (v !== 'ALL') setMapLevel('desa');
                            else setMapLevel('kec');
                        }} 
                    />
                    
                    {selKec !== 'ALL' && (
                        <FilterDropdown 
                            label="Desa / Kelurahan" 
                            value={selDesa} 
                            options={desaOptions} 
                            onChange={(v) => { 
                                setSelDesa(v); 
                                setSelSLS('ALL'); 
                                if (v !== 'ALL') setMapLevel('sls');
                                else setMapLevel('desa');
                            }} 
                        />
                    )}

                    {selDesa !== 'ALL' && (
                        <FilterDropdown 
                            label="SLS / Satuan Lingkungan" 
                            value={selSLS} 
                            options={slsOptions} 
                            onChange={(v) => {
                                setSelSLS(v);
                                setMapLevel('sls');
                            }} 
                        />
                    )}
                </div>

                <div className="pt-4">
                    <button 
                        onClick={() => { 
                            setSelKec('ALL'); 
                            setSelDesa('ALL'); 
                            setSelSLS('ALL'); 
                            setMapLevel('kec');
                        }}
                        className="w-full py-4 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-[11px] font-bold uppercase transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
                    >
                        Reset Navigation
                    </button>
                    <p className="text-[10px] text-center text-slate-400 font-medium mt-6 leading-relaxed">
                        Map bounds will automatically <br/>adjust to selection
                    </p>
                </div>
            </div>
        </motion.div>
          ) : (
            <motion.button 
              key="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => setIsMenuOpen(true)}
              className="p-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 flex items-center gap-4 text-slate-800 hover:bg-white transition-all group"
            >
              <div className="p-2.5 bg-primary-600 rounded-xl text-white shadow-lg shadow-primary-500/20 group-hover:scale-110 transition-transform">
                <MapIcon size={20} />
              </div>
              <div className="text-left">
                <span className="font-bold text-[10px] uppercase tracking-widest text-slate-900 block">Open Panel</span>
                <span className="text-[9px] text-slate-400 uppercase font-medium">Navigation</span>
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilterDropdown({ label, value, options, onChange, disabled = false }: { label: string, value: string, options: [string, string][], onChange: (v: string) => void, disabled?: boolean }) {
    const isActive = value !== 'ALL';
    return (
        <div className={`space-y-2 ${disabled ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex justify-between">
                <span>{label}</span>
                {isActive && <span className="text-primary-500 font-bold">ACTIVE</span>}
            </label>
            <div className={`relative group transition-all duration-300`}>
                <select 
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:ring-4 transition-all appearance-none cursor-pointer pr-10 ${isActive ? 'border-primary-300 text-primary-700 bg-primary-50/30 ring-2 ring-primary-500/10' : 'border-slate-200 text-slate-700 focus:ring-primary-100 focus:border-primary-300'}`}
                >
                    <option value="ALL">ALL {label.toUpperCase()}</option>
                    {options.map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                    ))}
                </select>
                <div className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${isActive ? 'text-primary-500' : 'text-slate-400'}`}>
                    <ChevronDown size={16} />
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, color, sub }: { label: string, value: number, color: string, sub?: string }) {
    const theme = color === 'emerald' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-700';
    return (
        <div className={`p-5 rounded-2xl border transition-all hover:shadow-md ${theme}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] opacity-50 mb-1">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-sans tracking-tight">{value}</span>
                {sub && <span className="text-[11px] font-black opacity-40">{sub}</span>}
            </div>
        </div>
    );
}

function ProgressRow({ label, value, color, bg }: { label: string, value: number, color: string, bg: string }) {
    return (
        <div className="flex items-center justify-between group py-1">
            <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${bg} shadow-lg transition-transform group-hover:scale-150`}></div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight group-hover:text-slate-700 transition-colors">{label}</span>
            </div>
            <span className={`text-[13px] font-extrabold font-sans ${color}`}>{value}</span>
        </div>
    );
}

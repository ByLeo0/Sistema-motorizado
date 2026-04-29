import React, {useState, useEffect, useCallback, useRef, memo} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  Modal, TextInput, Image, Share, Linking,
  Dimensions,
} from 'react-native';
import MapView, {Marker, Polyline, UrlTile} from 'react-native-maps';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {serviceAPI} from '../services/api';
import {useServiceStore, useTrackingStore} from '../store';
import {useBackgroundTracking} from '../hooks/useBackgroundTracking';
import {useTheme} from '../context/ThemeContext';
import Toast from 'react-native-toast-message';

const {height: SCREEN_H} = Dimensions.get('window');

const DOC_TYPES = [
  {value: 'delivery_note', label: 'Guía de remisión'},
  {value: 'invoice',       label: 'Factura'},
  {value: 'receipt',       label: 'Recibo'},
  {value: 'other',         label: 'Otro'},
];

const STATUS_LABEL = {
  pending:    'Pendiente',
  approved:   'Aprobado',
  in_transit: 'En tránsito',
  completed:  'Completado',
  cancelled:  'Cancelado',
  rejected:   'Rechazado',
};

// ── Decodificador de polyline (precision 5, OSRM) ─────────────────────────────
function decodePolyline(encoded) {
  if (!encoded) return [];
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, b;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push({latitude: lat / 1e5, longitude: lng / 1e5});
  }
  return coords;
}

function calcETA(lat1, lng1, lat2, lng2, speedKmh = 25) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return {distKm: distKm.toFixed(1), minutes: Math.round((distKm / speedKmh) * 60)};
}

async function openInOsm(destLat, destLng) {
  const osmand = `osmand.navigation:q=${destLat},${destLng}`;
  const web    = `https://www.openstreetmap.org/directions?from=&to=${destLat},${destLng}`;
  try {
    const ok = await Linking.canOpenURL(osmand);
    await Linking.openURL(ok ? osmand : web);
  } catch { await Linking.openURL(web); }
}

// ── Error boundary ────────────────────────────────────────────────────────────
class MapBoundary extends React.Component {
  state = {error: false};
  static getDerivedStateFromError() { return {error: true}; }
  render() {
    if (this.state.error) return this.props.fallback ?? null;
    return this.props.children;
  }
}

// ── Mapa OSM — memo para evitar re-mount en cada render ──────────────────────
const RouteMapReal = memo(function RouteMapReal({
  originLat, originLng, destLat, destLng,
  mapRegion, routeCoords, locationTrail,
  lastLocation, snappedPoint, isInTransit, isDeviated, height,
}) {
  return (
    <MapView
      style={[s.map, {height}]}
      initialRegion={mapRegion}
      mapType="none"
      scrollEnabled
      zoomEnabled
    >
      <UrlTile
        urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maximumZ={19}
        tileSize={256}
        flipY={false}
      />

      {/* Ruta fija asignada — violeta */}
      {routeCoords.length > 1 && (
        <Polyline coordinates={routeCoords} strokeColor="#534AB7" strokeWidth={3} />
      )}

      {/* Rastro real del recorrido — naranja punteado */}
      {locationTrail.length > 1 && isInTransit && (
        <Polyline
          coordinates={locationTrail}
          strokeColor="#F59E0B"
          strokeWidth={2}
          lineDashPattern={[6, 3]}
        />
      )}

      {/* Marcadores fijos */}
      <Marker coordinate={{latitude: originLat, longitude: originLng}}
        title="Origen" pinColor="#534AB7" />
      <Marker coordinate={{latitude: destLat, longitude: destLng}}
        title="Destino" pinColor="#D85A30" />

      {/* Posición actual */}
      {lastLocation && isInTransit && (
        <Marker coordinate={{latitude: lastLocation.lat, longitude: lastLocation.lng}}
          title="Mi posición" pinColor="#1D9E75" />
      )}

      {/* Punto snap sobre el eje de ruta */}
      {snappedPoint && isInTransit && (
        <Marker coordinate={{latitude: snappedPoint.lat, longitude: snappedPoint.lng}}
          title="Posición en ruta"
          pinColor={isDeviated ? '#F59E0B' : '#0F6E56'} />
      )}
    </MapView>
  );
});

// ── Barra de señal GPS ────────────────────────────────────────────────────────
const GPS_CFG = {
  idle:      {color: '#9CA3AF', label: 'GPS inactivo'},
  searching: {color: '#F59E0B', label: 'Buscando señal GPS...'},
  active:    {color: '#1D9E75', label: 'Señal GPS activa'},
  lost:      {color: '#D85A30', label: 'Señal GPS perdida'},
};

function GpsSignalBar({status, pings, bgColor}) {
  const cfg = GPS_CFG[status] || GPS_CFG.idle;
  return (
    <View style={[s.gpsBar, {backgroundColor: bgColor, borderColor: cfg.color + '44'}]}>
      <View style={[s.gpsDot, {backgroundColor: cfg.color}]} />
      <Text style={[s.gpsBarLabel, {color: cfg.color}]}>{cfg.label}</Text>
      {pings > 0 && (
        <Text style={[s.gpsBarPings, {color: cfg.color + 'AA'}]}> · {pings} pings</Text>
      )}
    </View>
  );
}

// ── Helpers con tema ──────────────────────────────────────────────────────────
function Row({label, value, valueColor, c}) {
  return (
    <View style={[s.row, {borderBottomColor: c.separator}]}>
      <Text style={[s.rowLabel, {color: c.hint}]}>{label}</Text>
      <Text style={[s.rowValue, {color: valueColor || c.text}]}>{value}</Text>
    </View>
  );
}

function InfoBlock({icon, label, c, children}) {
  return (
    <View style={[s.infoBlock, {borderBottomColor: c.separator}]}>
      <View style={s.infoBlockLeft}>
        <Text style={s.infoIcon}>{icon}</Text>
      </View>
      <View style={s.infoBlockRight}>
        <Text style={[s.infoLabel, {color: c.hint}]}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function ServiceDetailScreen({route, navigation}) {
  const {serviceId} = route.params;
  const {colors: c} = useTheme();

  const [service,       setService]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [acting,        setActing]        = useState(false);
  const [showMap,       setShowMap]       = useState(false);
  const [fullMap,       setFullMap]       = useState(false);

  // Doc modal
  const [docModal,       setDocModal]       = useState(false);
  const [docType,        setDocType]        = useState('delivery_note');
  const [recipientName,  setRecipientName]  = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientAddr,  setRecipientAddr]  = useState('');
  const [docPhoto,       setDocPhoto]       = useState(null);
  const [docSubmitting,  setDocSubmitting]  = useState(false);
  const [uploadedDocs,   setUploadedDocs]   = useState([]);

  const updateStatus    = useServiceStore(s => s.updateServiceStatus);
  const isTracking      = useTrackingStore(s => s.isTracking);
  const isConnected     = useTrackingStore(s => s.isConnected);
  const deviationM      = useTrackingStore(s => s.deviationMeters);
  const isDeviated      = useTrackingStore(s => s.isDeviated);
  const routeStatus     = useTrackingStore(s => s.routeStatus);
  const snappedPoint    = useTrackingStore(s => s.snappedPoint);
  const lastLocation    = useTrackingStore(s => s.lastLocation);
  const totalPings      = useTrackingStore(s => s.totalPings);
  const gpsSignalStatus = useTrackingStore(s => s.gpsSignalStatus);
  const locationTrail   = useTrackingStore(s => s.locationTrail);

  const {startTracking, stopTracking} = useBackgroundTracking(
    service?.status === 'in_transit' ? serviceId : null,
  );

  const fetchDetail = useCallback(async () => {
    try {
      const {data} = await serviceAPI.detail(serviceId);
      setService(data);
      if (data.documents) setUploadedDocs(data.documents);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el servicio.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // GPS permission
  const ensureGPS = async () => {
    const perm   = PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
    const result = await check(perm);
    if (result === RESULTS.GRANTED) return true;
    if (result === RESULTS.DENIED) return (await request(perm)) === RESULTS.GRANTED;
    return false;
  };

  // Iniciar
  const handleStart = async () => {
    if (!await ensureGPS()) {
      Alert.alert('GPS requerido',
        'Activa el permiso de ubicación: Ajustes → Aplicaciones → CLSP → Permisos → Ubicación.');
      return;
    }
    Alert.alert('Iniciar servicio', '¿Confirmas que comenzarás el recorrido ahora?', [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Iniciar', onPress: async () => {
        setActing(true);
        try {
          await serviceAPI.start(serviceId);
          setService(prev => ({...prev, status: 'in_transit'}));
          updateStatus(serviceId, 'in_transit');
          await startTracking();
        } catch (err) {
          Alert.alert('Error', err.response?.data?.error || 'No se pudo iniciar.');
        } finally { setActing(false); }
      }},
    ]);
  };

  // Completar
  const handleComplete = async () => {
    if (uploadedDocs.length === 0) {
      Alert.alert('Documento requerido', 'Sube al menos un documento antes de completar.');
      return;
    }
    Alert.alert('Completar entrega', '¿Confirmas que la entrega fue realizada?', [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Completar', style: 'destructive', onPress: async () => {
        setActing(true);
        try {
          if (isTracking) { try { await stopTracking(); } catch (_) {} }
          await serviceAPI.complete(serviceId);
          setService(prev => ({...prev, status: 'completed'}));
          updateStatus(serviceId, 'completed');
          Alert.alert('Entrega completada', 'El servicio fue marcado como entregado exitosamente.');
        } catch (err) {
          Alert.alert('Error', err.response?.data?.error || 'No se pudo completar.');
        } finally { setActing(false); }
      }},
    ]);
  };

  const handleShare = async () => {
    if (!service) return;
    const url = `https://www.openstreetmap.org/directions?from=${service.origin_lat},${service.origin_lng}&to=${service.destination_lat},${service.destination_lng}`;
    try {
      await Share.share({
        message: `CLSP — Ruta de entrega\nOrigen: ${service.origin_lat?.toFixed(5)}, ${service.origin_lng?.toFixed(5)}\nDestino: ${service.destination_lat?.toFixed(5)}, ${service.destination_lng?.toFixed(5)}\nVer: ${url}`,
        title: 'Ruta CLSP',
      });
    } catch (_) {}
  };

  const handleOpenNavigation = async () => {
    if (!service) return;
    await openInOsm(service.destination_lat, service.destination_lng);
  };

  // Doc photo
  const pickDocPhoto = () => {
    Alert.alert('Adjuntar imagen', '¿Cómo deseas adjuntar?', [
      {text: 'Cámara',   onPress: async () => { const r = await launchCamera({mediaType: 'photo', quality: 0.8}); if (!r.didCancel && r.assets?.[0]) setDocPhoto(r.assets[0]); }},
      {text: 'Galería',  onPress: async () => { const r = await launchImageLibrary({mediaType: 'photo', quality: 0.8}); if (!r.didCancel && r.assets?.[0]) setDocPhoto(r.assets[0]); }},
      {text: 'Cancelar', style: 'cancel'},
    ]);
  };

  const resetDocForm = () => {
    setDocType('delivery_note'); setRecipientName('');
    setRecipientPhone(''); setRecipientAddr(''); setDocPhoto(null);
  };

  const handleDocSubmit = async () => {
    if (!docPhoto)              { Alert.alert('Error', 'Adjunta una imagen del documento.'); return; }
    if (!recipientName.trim())  { Alert.alert('Error', 'El nombre es obligatorio.');        return; }
    setDocSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('doc_type',          docType);
      fd.append('recipient_name',    recipientName.trim());
      fd.append('recipient_phone',   recipientPhone.trim());
      fd.append('recipient_address', recipientAddr.trim());
      fd.append('file', {uri: docPhoto.uri, type: docPhoto.type || 'image/jpeg', name: docPhoto.fileName || `doc_${Date.now()}.jpg`});
      const {data} = await serviceAPI.uploadDocument(serviceId, fd);
      setUploadedDocs(prev => [...prev, data]);
      Toast.show({type: 'success', text1: 'Documento subido'});
      setDocModal(false); resetDocForm();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo subir el documento.');
    } finally { setDocSubmitting(false); }
  };

  // ── Valores derivados ──────────────────────────────────────────────────────
  const isInTransit = service?.status === 'in_transit';
  const isApproved  = service?.status === 'approved';
  const isCompleted = service?.status === 'completed';

  const mapRegion = service ? {
    latitude:       (service.origin_lat + service.destination_lat) / 2,
    longitude:      (service.origin_lng + service.destination_lng) / 2,
    latitudeDelta:  Math.abs(service.origin_lat - service.destination_lat) * 1.6 + 0.01,
    longitudeDelta: Math.abs(service.origin_lng - service.destination_lng) * 1.6 + 0.01,
  } : null;

  const routeCoords = service?.route?.encoded_polyline
    ? decodePolyline(service.route.encoded_polyline)
    : (service?.route?.geometry?.coordinates
        ? service.route.geometry.coordinates.map(([ln, la]) => ({latitude: la, longitude: ln}))
        : []);

  const speed = lastLocation?.speed > 0 ? lastLocation.speed : 25;
  const eta = service
    ? calcETA(service.origin_lat, service.origin_lng, service.destination_lat, service.destination_lng, speed)
    : null;
  const currentETA = lastLocation && service
    ? calcETA(lastLocation.lat, lastLocation.lng, service.destination_lat, service.destination_lng, speed)
    : eta;

  // Badge de estado
  const badgeStyle = isDeviated
    ? {bg: c.dangerBg,   text: c.danger}
    : isCompleted
    ? {bg: c.successBg,  text: c.success}
    : isInTransit
    ? {bg: c.primaryBg,  text: c.primary}
    : isApproved
    ? {bg: c.badgeApproved.bg, text: c.badgeApproved.text}
    : {bg: c.cardBorder, text: c.subtext};

  const statusText = isDeviated ? 'DESVIADO'
    : isCompleted  ? 'Completado'
    : isInTransit  ? routeStatus
    : isApproved   ? 'Aprobado'
    : STATUS_LABEL[service?.status] || service?.status;

  if (loading) {
    return (
      <View style={[s.center, {backgroundColor: c.bg}]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const mapFallback = (
    <View style={[s.mapFallback, {backgroundColor: c.cardBorder}]}>
      <Text style={[s.mapFallbackText, {color: c.hint}]}>El mapa no pudo cargar.</Text>
      <TouchableOpacity style={[s.osmBtn, {backgroundColor: c.primaryBg}]} onPress={handleOpenNavigation}>
        <Text style={[s.osmBtnText, {color: c.primary}]}>Abrir en OSM</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={[s.container, {backgroundColor: c.bg}]} contentContainerStyle={s.content}>

      {/* ── Cabecera ── */}
      <View style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <View style={s.headerTop}>
          <View style={{flex: 1}}>
            <Text style={[s.headerNumber, {color: c.text}]}>
              {service?.number ? `Servicio #${String(service.number).padStart(4, '0')}` : 'Servicio'}
            </Text>
            {service?.created_at && (
              <Text style={[s.headerDate, {color: c.hint}]}>
                {new Date(service.created_at).toLocaleDateString('es-PE', {day: '2-digit', month: 'long', year: 'numeric'})}
              </Text>
            )}
          </View>
          <View style={[s.badge, {backgroundColor: badgeStyle.bg}]}>
            <Text style={[s.badgeText, {color: badgeStyle.text}]}>{statusText}</Text>
          </View>
        </View>

        {isInTransit && (
          <GpsSignalBar status={gpsSignalStatus} pings={totalPings} bgColor={c.gpuBar} />
        )}
      </View>

      {/* ── ETA ── */}
      {(isApproved || isInTransit) && currentETA && (
        <View style={[s.etaCard, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
          <View style={s.etaItem}>
            <Text style={[s.etaLabel, {color: c.hint}]}>Distancia</Text>
            <Text style={[s.etaValue, {color: c.text}]}>{currentETA.distKm} km</Text>
          </View>
          <View style={[s.etaDivider, {backgroundColor: c.separator}]} />
          <View style={s.etaItem}>
            <Text style={[s.etaLabel, {color: c.hint}]}>Tiempo est.</Text>
            <Text style={[s.etaValue, {color: c.text}]}>{currentETA.minutes} min</Text>
          </View>
          <View style={[s.etaDivider, {backgroundColor: c.separator}]} />
          <TouchableOpacity style={s.etaItem} onPress={handleOpenNavigation}>
            <Text style={[s.etaLabel, {color: c.hint}]}>Navegar</Text>
            <Text style={[s.etaValue, {color: c.primary}]}>OSM</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Mapa ── */}
      <View style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <View style={s.rowBetween}>
          <Text style={[s.sectionTitle, {color: c.text}]}>Mapa del recorrido</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            <TouchableOpacity style={[s.toggleBtn, {backgroundColor: c.primaryBg}]} onPress={() => setShowMap(v => !v)}>
              <Text style={[s.toggleBtnText, {color: c.primary}]}>{showMap ? 'Ocultar' : 'Ver mapa'}</Text>
            </TouchableOpacity>
            {showMap && (
              <TouchableOpacity style={[s.toggleBtn, {backgroundColor: c.primaryBg}]} onPress={() => setFullMap(true)}>
                <Text style={[s.toggleBtnText, {color: c.primary}]}>Expandir</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Leyenda de colores */}
        {showMap && routeCoords.length > 0 && (
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.legendLine, {backgroundColor: '#534AB7'}]} />
              <Text style={[s.legendText, {color: c.hint}]}>Ruta asignada</Text>
            </View>
            {isInTransit && locationTrail.length > 1 && (
              <View style={s.legendItem}>
                <View style={[s.legendLine, {backgroundColor: '#F59E0B'}]} />
                <Text style={[s.legendText, {color: c.hint}]}>Recorrido real</Text>
              </View>
            )}
          </View>
        )}

        {showMap && mapRegion ? (
          <MapBoundary fallback={mapFallback}>
            <RouteMapReal
              originLat={service.origin_lat}  originLng={service.origin_lng}
              destLat={service.destination_lat} destLng={service.destination_lng}
              mapRegion={mapRegion}
              routeCoords={routeCoords}
              locationTrail={locationTrail}
              lastLocation={lastLocation}
              snappedPoint={snappedPoint}
              isInTransit={isInTransit}
              isDeviated={isDeviated}
              height={220}
            />
          </MapBoundary>
        ) : !showMap ? (
          <TouchableOpacity onPress={handleOpenNavigation} style={[s.osmBtn, {backgroundColor: c.primaryBg}]}>
            <Text style={[s.osmBtnText, {color: c.primary}]}>Abrir navegación en OSM</Text>
          </TouchableOpacity>
        ) : mapFallback}
      </View>

      {/* ── GPS en vivo ── */}
      {isInTransit && (
        <View style={[s.card, {backgroundColor: c.card, borderColor: isDeviated ? c.danger : c.cardBorder, borderWidth: isDeviated ? 1.5 : 1}]}>
          <Text style={[s.sectionTitle, {color: c.text}]}>Ubicación en tiempo real</Text>
          {lastLocation ? (
            <>
              <Row label="Latitud"   value={lastLocation.lat?.toFixed(6)}               c={c} />
              <Row label="Longitud"  value={lastLocation.lng?.toFixed(6)}               c={c} />
              <Row label="Velocidad" value={`${lastLocation.speed?.toFixed(1)} km/h`}   c={c} />
              <Row label="Precisión" value={`±${lastLocation.accuracy?.toFixed(0)} m`}  c={c} />
              <Row label="Desvío"    value={`${deviationM.toFixed(0)} m`}
                   valueColor={isDeviated ? c.danger : c.success} c={c} />
              <Row label="Estado"    value={routeStatus}
                   valueColor={isDeviated ? c.danger : c.success} c={c} />
            </>
          ) : (
            <Text style={[s.waiting, {color: c.hint}]}>
              {gpsSignalStatus === 'searching'
                ? 'Buscando señal GPS...'
                : gpsSignalStatus === 'lost'
                ? 'Señal GPS perdida. Verifica el GPS del dispositivo.'
                : 'Obteniendo ubicación...'}
            </Text>
          )}
        </View>
      )}

      {/* ── Detalles ── */}
      <View style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <Text style={[s.sectionTitle, {color: c.text}]}>Detalles del servicio</Text>

        <InfoBlock icon="📍" label="Punto de origen" c={c}>
          <Text style={[s.infoValue, {color: c.subtext}]}>
            {`${service?.origin_lat?.toFixed(5)}, ${service?.origin_lng?.toFixed(5)}`}
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL(
            `https://www.openstreetmap.org/?mlat=${service?.origin_lat}&mlon=${service?.origin_lng}&zoom=17`
          )}>
            <Text style={[s.infoLink, {color: c.primary}]}>Ver en mapa →</Text>
          </TouchableOpacity>
        </InfoBlock>

        <InfoBlock icon="🏁" label="Punto de destino" c={c}>
          <Text style={[s.infoValue, {color: c.subtext}]}>
            {`${service?.destination_lat?.toFixed(5)}, ${service?.destination_lng?.toFixed(5)}`}
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL(
            `https://www.openstreetmap.org/?mlat=${service?.destination_lat}&mlon=${service?.destination_lng}&zoom=17`
          )}>
            <Text style={[s.infoLink, {color: c.primary}]}>Ver en mapa →</Text>
          </TouchableOpacity>
        </InfoBlock>

        {service?.notes && (
          <InfoBlock icon="📝" label="Notas" c={c}>
            <Text style={[s.infoValue, {color: c.subtext}]}>{service.notes}</Text>
          </InfoBlock>
        )}

        {service?.route && (
          <InfoBlock icon="🛡" label="Corredor de ruta" c={c}>
            <Text style={[s.infoValue, {color: c.subtext}]}>
              Tolerancia de {service.route.tolerance_meters} m
            </Text>
          </InfoBlock>
        )}

        {service?.customer_name ? (
          <InfoBlock icon="👤" label="Destinatario" c={c}>
            <Text style={[s.infoValue, {color: c.subtext}]}>{service.customer_name}</Text>
            {service.customer_phone ? (
              <Text style={[s.infoValue, {color: c.hint, marginTop: 2}]}>{service.customer_phone}</Text>
            ) : null}
          </InfoBlock>
        ) : null}

        {service?.approved_at && (
          <InfoBlock icon="🕐" label="Aprobado" c={c}>
            <Text style={[s.infoValue, {color: c.subtext}]}>
              {new Date(service.approved_at).toLocaleString('es-PE', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </InfoBlock>
        )}

        <View style={s.idRow}>
          <Text style={[s.idText, {color: c.hint}]}>ID: {service?.id?.slice(-12).toUpperCase()}</Text>
        </View>
      </View>

      {/* ── Documentos ── */}
      {(isInTransit || isCompleted) && (
        <View style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
          <View style={s.rowBetween}>
            <Text style={[s.sectionTitle, {color: c.text}]}>Documentos ({uploadedDocs.length})</Text>
            {isInTransit && (
              <TouchableOpacity style={[s.scanBtn, {backgroundColor: c.success}]} onPress={() => setDocModal(true)}>
                <Text style={s.scanBtnText}>+ Subir doc</Text>
              </TouchableOpacity>
            )}
          </View>
          {uploadedDocs.length === 0 && (
            <Text style={[s.waiting, {color: c.hint}]}>Sin documentos. Sube la guía de remisión.</Text>
          )}
          {uploadedDocs.map(doc => (
            <View key={doc.id} style={[s.docItem, {borderBottomColor: c.separator}]}>
              <View>
                <Text style={[s.docType, {color: c.text}]}>{_docLabel(doc.doc_type)}</Text>
                {doc.recipient_name ? <Text style={[s.docSub, {color: c.hint}]}>{doc.recipient_name}</Text> : null}
              </View>
              <Text style={[s.docDate, {color: c.hint}]}>{new Date(doc.uploaded_at).toLocaleTimeString('es-PE')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Acciones ── */}
      <View style={s.actions}>
        {isApproved && (
          <TouchableOpacity style={[s.btn, {backgroundColor: c.primary}]} onPress={handleStart} disabled={acting}>
            {acting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Iniciar recorrido</Text>}
          </TouchableOpacity>
        )}
        {isInTransit && (
          <TouchableOpacity style={[s.btn, {backgroundColor: c.success}]} onPress={handleComplete} disabled={acting}>
            {acting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Completar entrega</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.btn, {backgroundColor: c.cardBorder}]} onPress={handleShare}>
          <Text style={[s.btnText, {color: c.subtext}]}>Compartir ruta</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal mapa fullscreen ── */}
      <Modal visible={fullMap} animationType="slide" statusBarTranslucent>
        <View style={s.fullMapContainer}>
          {mapRegion && service && (
            <MapBoundary fallback={
              <View style={[s.center, {backgroundColor: c.bg}]}>
                <Text style={{color: c.text}}>Error al cargar el mapa.</Text>
              </View>
            }>
              <RouteMapReal
                originLat={service.origin_lat}  originLng={service.origin_lng}
                destLat={service.destination_lat} destLng={service.destination_lng}
                mapRegion={mapRegion}
                routeCoords={routeCoords}
                locationTrail={locationTrail}
                lastLocation={lastLocation}
                snappedPoint={snappedPoint}
                isInTransit={isInTransit}
                isDeviated={isDeviated}
                height={SCREEN_H}
              />
            </MapBoundary>
          )}
          <View style={s.fullMapOverlay}>
            <TouchableOpacity style={s.fullMapClose} onPress={() => setFullMap(false)}>
              <Text style={s.fullMapCloseText}>✕ Cerrar</Text>
            </TouchableOpacity>
            {currentETA && (
              <View style={[s.fullMapETA, {backgroundColor: c.primary + 'EE'}]}>
                <Text style={s.fullMapETAText}>{currentETA.distKm} km · {currentETA.minutes} min</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={[s.fullMapNavBtn, {backgroundColor: c.primary}]} onPress={handleOpenNavigation}>
            <Text style={s.fullMapNavText}>Navegar con OsmAnd</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Modal documento ── */}
      <Modal visible={docModal} animationType="slide" transparent>
        <View style={[s.overlay, {backgroundColor: c.overlay}]}>
          <View style={[s.sheet, {backgroundColor: c.sheet}]}>
            <Text style={[s.sheetTitle, {color: c.text}]}>Subir documento</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.label, {color: c.subtext}]}>Tipo de documento</Text>
              <View style={s.typeGrid}>
                {DOC_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.typeChip, {borderColor: c.inputBorder, backgroundColor: docType === t.value ? c.primary : 'transparent'}]}
                    onPress={() => setDocType(t.value)}>
                    <Text style={[s.typeChipText, {color: docType === t.value ? '#fff' : c.subtext}]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.label, {color: c.subtext, marginTop: 14}]}>Nombre del destinatario *</Text>
              <TextInput
                style={[s.input, {backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text}]}
                placeholder="Nombre y apellido" placeholderTextColor={c.hint}
                value={recipientName} onChangeText={setRecipientName}
              />
              <Text style={[s.label, {color: c.subtext, marginTop: 10}]}>Teléfono</Text>
              <TextInput
                style={[s.input, {backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text}]}
                placeholder="Número de teléfono" placeholderTextColor={c.hint}
                value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad"
              />
              <Text style={[s.label, {color: c.subtext, marginTop: 10}]}>Dirección</Text>
              <TextInput
                style={[s.input, {backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text}]}
                placeholder="Dirección del destinatario" placeholderTextColor={c.hint}
                value={recipientAddr} onChangeText={setRecipientAddr}
              />
              <TouchableOpacity style={[s.photoBtn, {backgroundColor: c.primaryBg}]} onPress={pickDocPhoto}>
                <Text style={[s.photoBtnText, {color: c.primary}]}>
                  {docPhoto ? 'Imagen adjuntada — cambiar' : 'Tomar foto del documento *'}
                </Text>
              </TouchableOpacity>
              {docPhoto && <Image source={{uri: docPhoto.uri}} style={s.preview} resizeMode="cover" />}
            </ScrollView>
            <View style={s.sheetActions}>
              <TouchableOpacity
                style={[s.cancelBtn, {borderColor: c.inputBorder}]}
                onPress={() => { setDocModal(false); resetDocForm(); }}>
                <Text style={[s.cancelText, {color: c.subtext}]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, {backgroundColor: c.primary, opacity: docSubmitting ? 0.6 : 1}]}
                onPress={handleDocSubmit} disabled={docSubmitting}>
                {docSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Subir</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

function _docLabel(type) {
  const map = {delivery_note: 'Guía de remisión', invoice: 'Factura', receipt: 'Recibo', other: 'Otro'};
  return map[type] || type;
}

// ── Estilos base (sin colores — los colores van inline con el tema) ────────────
const s = StyleSheet.create({
  container: {flex: 1},
  content:   {padding: 16, gap: 14, paddingBottom: 40},
  center:    {flex: 1, justifyContent: 'center', alignItems: 'center'},

  card:       {borderRadius: 16, padding: 16, borderWidth: 1,
               shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3},
  headerTop:  {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12},
  headerNumber:{fontSize: 18, fontWeight: '800'},
  headerDate: {fontSize: 12, marginTop: 2},

  badge:     {borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start'},
  badgeText: {fontSize: 12, fontWeight: '700'},

  gpsBar:      {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
                borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1},
  gpsDot:      {width: 8, height: 8, borderRadius: 4},
  gpsBarLabel: {fontSize: 12, fontWeight: '600', flex: 1},
  gpsBarPings: {fontSize: 11},

  etaCard:   {borderRadius: 14, padding: 16, borderWidth: 1,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2},
  etaItem:   {alignItems: 'center'},
  etaLabel:  {fontSize: 11, marginBottom: 2},
  etaValue:  {fontSize: 16, fontWeight: '700'},
  etaDivider:{width: 1, height: 32},

  sectionTitle:{fontSize: 14, fontWeight: '600', marginBottom: 12},
  waiting:     {fontSize: 13, textAlign: 'center', paddingVertical: 8},

  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  toggleBtn:  {borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6},
  toggleBtnText:{fontSize: 12, fontWeight: '600'},

  legend:      {flexDirection: 'row', gap: 16, marginBottom: 8},
  legendItem:  {flexDirection: 'row', alignItems: 'center', gap: 6},
  legendLine:  {width: 20, height: 3, borderRadius: 2},
  legendText:  {fontSize: 11},

  map:         {width: '100%', borderRadius: 10, marginTop: 4},
  mapFallback: {height: 120, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 4},
  mapFallbackText:{fontSize: 13, marginBottom: 8},
  osmBtn:      {borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8, alignItems: 'center'},
  osmBtnText:  {fontWeight: '600', fontSize: 13},

  row:       {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1},
  rowLabel:  {fontSize: 13, flex: 1},
  rowValue:  {fontSize: 13, fontWeight: '500', flex: 2, textAlign: 'right'},

  infoBlock:      {flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1},
  infoBlockLeft:  {width: 28, alignItems: 'center', paddingTop: 1},
  infoBlockRight: {flex: 1},
  infoIcon:       {fontSize: 16},
  infoLabel:      {fontSize: 11, fontWeight: '600', marginBottom: 2},
  infoValue:      {fontSize: 13, fontWeight: '500'},
  infoLink:       {fontSize: 11, fontWeight: '600', marginTop: 2},
  idRow:          {paddingTop: 10, alignItems: 'flex-end'},
  idText:         {fontSize: 10, fontFamily: 'monospace'},

  scanBtn:     {borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8},
  scanBtnText: {color: '#fff', fontSize: 13, fontWeight: '600'},

  docItem: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 8, borderBottomWidth: 1},
  docType: {fontSize: 13, fontWeight: '500'},
  docSub:  {fontSize: 11, marginTop: 2},
  docDate: {fontSize: 12},

  actions: {gap: 10, marginTop: 4},
  btn:     {borderRadius: 12, padding: 16, alignItems: 'center'},
  btnText: {color: '#fff', fontSize: 16, fontWeight: '600'},

  fullMapContainer:{flex: 1, backgroundColor: '#000'},
  fullMapOverlay:  {position: 'absolute', top: 44, left: 0, right: 0,
                    flexDirection: 'row', justifyContent: 'space-between',
                    alignItems: 'center', paddingHorizontal: 16},
  fullMapClose:    {backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8},
  fullMapCloseText:{color: '#fff', fontWeight: '600'},
  fullMapETA:      {borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8},
  fullMapETAText:  {color: '#fff', fontSize: 13, fontWeight: '600'},
  fullMapNavBtn:   {position: 'absolute', bottom: 40, alignSelf: 'center',
                    borderRadius: 28, paddingHorizontal: 32, paddingVertical: 16,
                    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 8},
  fullMapNavText:  {color: '#fff', fontWeight: '700', fontSize: 16},

  overlay:     {flex: 1, justifyContent: 'flex-end'},
  sheet:       {borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%'},
  sheetTitle:  {fontSize: 18, fontWeight: '700', marginBottom: 16},
  label:       {fontSize: 13, fontWeight: '600', marginBottom: 6},
  input:       {borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14},
  typeGrid:    {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  typeChip:    {borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6},
  typeChipText:{fontSize: 12},
  photoBtn:    {marginTop: 12, borderRadius: 10, padding: 14, alignItems: 'center'},
  photoBtnText:{fontWeight: '600', fontSize: 13},
  preview:     {width: '100%', height: 160, borderRadius: 10, marginTop: 10},
  sheetActions:{flexDirection: 'row', gap: 10, marginTop: 16},
  cancelBtn:   {flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 14, alignItems: 'center'},
  cancelText:  {fontWeight: '600'},
  submitBtn:   {flex: 2, borderRadius: 12, padding: 14, alignItems: 'center'},
  submitText:  {color: '#fff', fontWeight: '700', fontSize: 15},
});

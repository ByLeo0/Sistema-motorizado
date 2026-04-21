import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  Modal, TextInput, Image, Share, Linking,
  Dimensions, Platform,
} from 'react-native';
import MapView, {Marker, Polyline} from 'react-native-maps';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {serviceAPI} from '../services/api';
import {useServiceStore, useTrackingStore} from '../store';
import {useBackgroundTracking} from '../hooks/useBackgroundTracking';
import Toast from 'react-native-toast-message';

const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');

const DOC_TYPES = [
  {value: 'delivery_note', label: 'Guía de remisión'},
  {value: 'invoice',       label: 'Factura'},
  {value: 'receipt',       label: 'Recibo'},
  {value: 'other',         label: 'Otro'},
];

// ── Haversine ETA ─────────────────────────────────────────────────────────────
function calcETA(lat1, lng1, lat2, lng2, speedKmh = 25) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const minutes = Math.round((distKm / speedKmh) * 60);
  return {distKm: distKm.toFixed(1), minutes};
}

// ── Error boundary para el mapa ───────────────────────────────────────────────
class MapBoundary extends React.Component {
  state = {error: false};
  static getDerivedStateFromError() { return {error: true}; }
  render() {
    if (this.state.error) return this.props.fallback ?? null;
    return this.props.children;
  }
}

export default function ServiceDetailScreen({route, navigation}) {
  const {serviceId} = route.params;
  const [service,   setService]  = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [acting,    setActing]   = useState(false);
  const [showMap,   setShowMap]  = useState(false);
  const [fullMap,   setFullMap]  = useState(false);
  const [mapError,  setMapError] = useState(false);

  // Document modal
  const [docModal,       setDocModal]       = useState(false);
  const [docType,        setDocType]        = useState('delivery_note');
  const [recipientName,  setRecipientName]  = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientAddr,  setRecipientAddr]  = useState('');
  const [docPhoto,       setDocPhoto]       = useState(null);
  const [docSubmitting,  setDocSubmitting]  = useState(false);
  const [uploadedDocs,   setUploadedDocs]   = useState([]);

  const updateStatus = useServiceStore(s => s.updateServiceStatus);
  const isTracking   = useTrackingStore(s => s.isTracking);
  const isConnected  = useTrackingStore(s => s.isConnected);
  const deviationM   = useTrackingStore(s => s.deviationMeters);
  const isDeviated   = useTrackingStore(s => s.isDeviated);
  const lastLocation = useTrackingStore(s => s.lastLocation);
  const totalPings   = useTrackingStore(s => s.totalPings);

  const {startTracking, stopTracking} = useBackgroundTracking(
    service?.status === 'in_transit' ? serviceId : null,
  );

  const fetchDetail = useCallback(async () => {
    try {
      const {data} = await serviceAPI.detail(serviceId);
      setService(data);
      if (data.documents) setUploadedDocs(data.documents);
    } catch (err) {
      Alert.alert('Error', 'No se pudo cargar el servicio.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // ── GPS permission ──────────────────────────────────────────────────────────
  const ensureGPS = async () => {
    const perm   = PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
    const result = await check(perm);
    if (result === RESULTS.GRANTED) return true;
    if (result === RESULTS.DENIED) {
      const r2 = await request(perm);
      return r2 === RESULTS.GRANTED;
    }
    return false;
  };

  // ── Start ───────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    const hasGPS = await ensureGPS();
    if (!hasGPS) {
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
          Toast.show({type: 'success', text1: 'Servicio iniciado', text2: 'GPS activo.'});
        } catch (err) {
          Alert.alert('Error', err.response?.data?.error || 'No se pudo iniciar.');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  // ── Complete ────────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (uploadedDocs.length === 0) {
      Alert.alert('Documento requerido',
        'Sube al menos un documento antes de completar.', [{text: 'Entendido'}]);
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
          Alert.alert(
            '✓ Entrega completada',
            'El servicio fue marcado como entregado exitosamente.',
            [{text: 'Aceptar'}],   // Usuario decide cuándo volver
          );
        } catch (err) {
          Alert.alert('Error', err.response?.data?.error || 'No se pudo completar.');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  // ── Share route ─────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!service) return;
    const url = `https://www.google.com/maps/dir/${service.origin_lat},${service.origin_lng}/${service.destination_lat},${service.destination_lng}`;
    try {
      await Share.share({
        message: `🚚 CLSP — Ruta de entrega\nOrigen: ${service.origin_lat.toFixed(5)}, ${service.origin_lng.toFixed(5)}\nDestino: ${service.destination_lat.toFixed(5)}, ${service.destination_lng.toFixed(5)}\nVer en mapa: ${url}`,
        title: 'Ruta CLSP',
      });
    } catch (_) {}
  };

  // ── Open in Google Maps ─────────────────────────────────────────────────────
  const openInGoogleMaps = async () => {
    if (!service) return;
    const url = Platform.select({
      android: `google.navigation:q=${service.destination_lat},${service.destination_lng}&mode=d`,
      ios:     `comgooglemaps://?daddr=${service.destination_lat},${service.destination_lng}&directionsmode=driving`,
    });
    const fallback = `https://www.google.com/maps/dir/${service.origin_lat},${service.origin_lng}/${service.destination_lat},${service.destination_lng}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      await Linking.openURL(canOpen ? url : fallback);
    } catch (_) {
      await Linking.openURL(fallback);
    }
  };

  // ── Document photo picker ───────────────────────────────────────────────────
  const pickDocPhoto = () => {
    Alert.alert('Adjuntar imagen', '¿Cómo deseas adjuntar?', [
      {text: 'Cámara', onPress: async () => {
        const r = await launchCamera({mediaType: 'photo', quality: 0.8});
        if (!r.didCancel && r.assets?.[0]) setDocPhoto(r.assets[0]);
      }},
      {text: 'Galería', onPress: async () => {
        const r = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
        if (!r.didCancel && r.assets?.[0]) setDocPhoto(r.assets[0]);
      }},
      {text: 'Cancelar', style: 'cancel'},
    ]);
  };

  const resetDocForm = () => {
    setDocType('delivery_note'); setRecipientName('');
    setRecipientPhone(''); setRecipientAddr(''); setDocPhoto(null);
  };

  const handleDocSubmit = async () => {
    if (!docPhoto) { Alert.alert('Error', 'Adjunta una imagen del documento.'); return; }
    if (!recipientName.trim()) { Alert.alert('Error', 'El nombre es obligatorio.'); return; }
    setDocSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('doc_type', docType);
      formData.append('recipient_name', recipientName.trim());
      formData.append('recipient_phone', recipientPhone.trim());
      formData.append('recipient_address', recipientAddr.trim());
      formData.append('file', {
        uri: docPhoto.uri, type: docPhoto.type || 'image/jpeg',
        name: docPhoto.fileName || `doc_${Date.now()}.jpg`,
      });
      const {data} = await serviceAPI.uploadDocument(serviceId, formData);
      setUploadedDocs(prev => [...prev, data]);
      Toast.show({type: 'success', text1: 'Documento subido'});
      setDocModal(false); resetDocForm();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo subir el documento.');
    } finally {
      setDocSubmitting(false);
    }
  };

  // ── Computed values ─────────────────────────────────────────────────────────
  const mapRegion = service ? {
    latitude:      (service.origin_lat + service.destination_lat) / 2,
    longitude:     (service.origin_lng + service.destination_lng) / 2,
    latitudeDelta:  Math.abs(service.origin_lat - service.destination_lat) * 1.6 + 0.01,
    longitudeDelta: Math.abs(service.origin_lng - service.destination_lng) * 1.6 + 0.01,
  } : null;

  const routeCoords = service?.route?.geometry?.coordinates
    ? service.route.geometry.coordinates.map(([lng, lat]) => ({latitude: lat, longitude: lng}))
    : [];

  const eta = service
    ? calcETA(service.origin_lat, service.origin_lng,
              service.destination_lat, service.destination_lng,
              lastLocation?.speed > 0 ? lastLocation.speed : 25)
    : null;

  const currentETA = lastLocation && service
    ? calcETA(lastLocation.lat, lastLocation.lng,
              service.destination_lat, service.destination_lng,
              lastLocation.speed > 0 ? lastLocation.speed : 25)
    : eta;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#534AB7" /></View>;
  }

  const isInTransit = service?.status === 'in_transit';
  const isApproved  = service?.status === 'approved';
  const isCompleted = service?.status === 'completed';

  const MapContent = ({height}) => (
    <MapView
      style={[styles.map, {height}]}
      initialRegion={mapRegion}
      showsUserLocation={isInTransit}
      showsMyLocationButton={isInTransit}
      scrollEnabled
      zoomEnabled
      onMapReady={() => setMapError(false)}
    >
      <Marker
        coordinate={{latitude: service.origin_lat, longitude: service.origin_lng}}
        title="Origen" pinColor="#534AB7"
      />
      <Marker
        coordinate={{latitude: service.destination_lat, longitude: service.destination_lng}}
        title="Destino" pinColor="#D85A30"
      />
      {lastLocation && isInTransit && (
        <Marker
          coordinate={{latitude: lastLocation.lat, longitude: lastLocation.lng}}
          title="Mi ubicación" pinColor="#1D9E75"
        />
      )}
      {routeCoords.length > 1 && (
        <Polyline coordinates={routeCoords} strokeColor="#1D9E75" strokeWidth={3} />
      )}
    </MapView>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Cabecera ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerNumber}>
              {service?.number ? `Servicio #${String(service.number).padStart(4, '0')}` : 'Servicio'}
            </Text>
            {service?.created_at && (
              <Text style={styles.headerDate}>
                {new Date(service.created_at).toLocaleDateString('es-PE', {day: '2-digit', month: 'long', year: 'numeric'})}
              </Text>
            )}
          </View>
          <View style={[
            styles.statusChip,
            isCompleted  && styles.chipCompleted,
            isInTransit  && (isDeviated ? styles.chipDeviated : styles.chipInTransit),
            isApproved   && styles.chipApproved,
          ]}>
            <Text style={styles.statusChipText}>
              {isCompleted ? '✓ Completado'
                : isInTransit ? (isDeviated ? '⚠ Fuera de ruta' : '● En tránsito')
                : isApproved  ? '◉ Aprobado'
                : service?.status}
            </Text>
          </View>
        </View>
        {isInTransit && (
          <View style={styles.gpsBar}>
            <View style={[styles.gpsDot, {backgroundColor: isConnected ? '#1D9E75' : '#F59E0B'}]} />
            <Text style={styles.gpsBarText}>
              {isConnected ? 'GPS activo' : 'GPS reconectando...'} · {totalPings} actualizaciones
            </Text>
          </View>
        )}
      </View>

      {/* ── ETA ── */}
      {(isApproved || isInTransit) && currentETA && (
        <View style={styles.etaCard}>
          <View style={styles.etaItem}>
            <Text style={styles.etaLabel}>Distancia</Text>
            <Text style={styles.etaValue}>{currentETA.distKm} km</Text>
          </View>
          <View style={styles.etaDivider} />
          <View style={styles.etaItem}>
            <Text style={styles.etaLabel}>Tiempo est.</Text>
            <Text style={styles.etaValue}>{currentETA.minutes} min</Text>
          </View>
          <View style={styles.etaDivider} />
          <TouchableOpacity style={styles.etaItem} onPress={openInGoogleMaps}>
            <Text style={styles.etaLabel}>Navegar</Text>
            <Text style={[styles.etaValue, {color: '#534AB7'}]}>Google Maps</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Mapa ── */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Mapa del recorrido</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            <TouchableOpacity style={styles.toggleMapBtn} onPress={() => setShowMap(v => !v)}>
              <Text style={styles.toggleMapText}>{showMap ? 'Ocultar' : 'Ver mapa'}</Text>
            </TouchableOpacity>
            {showMap && (
              <TouchableOpacity style={styles.toggleMapBtn} onPress={() => setFullMap(true)}>
                <Text style={styles.toggleMapText}>⛶ Expandir</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {showMap && mapRegion && (
          mapError ? (
            <View style={styles.mapFallback}>
              <Text style={styles.mapFallbackText}>El mapa no pudo cargar.</Text>
              <TouchableOpacity style={styles.openMapsBtn} onPress={openInGoogleMaps}>
                <Text style={styles.openMapsBtnText}>Abrir en Google Maps</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <MapBoundary fallback={
              <View style={styles.mapFallback}>
                <Text style={styles.mapFallbackText}>Error al cargar el mapa.</Text>
                <TouchableOpacity style={styles.openMapsBtn} onPress={openInGoogleMaps}>
                  <Text style={styles.openMapsBtnText}>Abrir en Google Maps</Text>
                </TouchableOpacity>
              </View>
            }>
              <MapContent height={200} />
            </MapBoundary>
          )
        )}
        {!showMap && (
          <TouchableOpacity onPress={openInGoogleMaps} style={styles.openMapsBtn}>
            <Text style={styles.openMapsBtnText}>Abrir navegación en Google Maps</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── GPS en vivo ── */}
      {isInTransit && (
        <View style={[styles.card, isDeviated && styles.cardAlert]}>
          <Text style={styles.sectionTitle}>Ubicación en tiempo real</Text>
          {lastLocation ? (
            <>
              <Row label="Latitud"   value={lastLocation.lat?.toFixed(6)} />
              <Row label="Longitud"  value={lastLocation.lng?.toFixed(6)} />
              <Row label="Velocidad" value={`${lastLocation.speed?.toFixed(1)} km/h`} />
              <Row label="Desvío"    value={`${deviationM.toFixed(0)} m`}
                   valueColor={isDeviated ? '#D85A30' : '#0F6E56'} />
            </>
          ) : (
            <Text style={styles.waiting}>Obteniendo ubicación GPS...</Text>
          )}
        </View>
      )}

      {/* ── Detalles ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Detalles del servicio</Text>

        <InfoBlock icon="📍" label="Punto de origen">
          <Text style={styles.infoValue}>
            {`${service?.origin_lat?.toFixed(5)}, ${service?.origin_lng?.toFixed(5)}`}
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL(
            `https://www.google.com/maps?q=${service?.origin_lat},${service?.origin_lng}`
          )}>
            <Text style={styles.infoLink}>Ver en mapa →</Text>
          </TouchableOpacity>
        </InfoBlock>

        <InfoBlock icon="🏁" label="Punto de destino">
          <Text style={styles.infoValue}>
            {`${service?.destination_lat?.toFixed(5)}, ${service?.destination_lng?.toFixed(5)}`}
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL(
            `https://www.google.com/maps?q=${service?.destination_lat},${service?.destination_lng}`
          )}>
            <Text style={styles.infoLink}>Ver en mapa →</Text>
          </TouchableOpacity>
        </InfoBlock>

        {service?.notes && (
          <InfoBlock icon="📝" label="Notas">
            <Text style={styles.infoValue}>{service.notes}</Text>
          </InfoBlock>
        )}

        {service?.route && (
          <InfoBlock icon="🛡" label="Corredor de ruta">
            <Text style={styles.infoValue}>Tolerancia de {service.route.tolerance_meters} m</Text>
          </InfoBlock>
        )}

        {service?.approved_at && (
          <InfoBlock icon="🕐" label="Aprobado">
            <Text style={styles.infoValue}>
              {new Date(service.approved_at).toLocaleString('es-PE', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </InfoBlock>
        )}

        <View style={styles.idRow}>
          <Text style={styles.idText}>ID: {service?.id?.slice(-12).toUpperCase()}</Text>
        </View>
      </View>

      {/* ── Documentos ── */}
      {(isInTransit || isCompleted) && (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Documentos ({uploadedDocs.length})</Text>
            {isInTransit && (
              <TouchableOpacity style={styles.scanBtn} onPress={() => setDocModal(true)}>
                <Text style={styles.scanBtnText}>+ Subir doc</Text>
              </TouchableOpacity>
            )}
          </View>
          {uploadedDocs.length === 0 && (
            <Text style={styles.waiting}>Sin documentos. Sube la guía de remisión.</Text>
          )}
          {uploadedDocs.map(doc => (
            <View key={doc.id} style={styles.docItem}>
              <View>
                <Text style={styles.docType}>{_docLabel(doc.doc_type)}</Text>
                {doc.recipient_name ? <Text style={styles.docSub}>{doc.recipient_name}</Text> : null}
              </View>
              <Text style={styles.docDate}>{new Date(doc.uploaded_at).toLocaleTimeString('es-PE')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Acciones ── */}
      <View style={styles.actions}>
        {isApproved && (
          <TouchableOpacity style={[styles.btn, styles.btnStart]} onPress={handleStart} disabled={acting}>
            {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Iniciar recorrido</Text>}
          </TouchableOpacity>
        )}
        {isInTransit && (
          <TouchableOpacity style={[styles.btn, styles.btnComplete]} onPress={handleComplete} disabled={acting}>
            {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Completar entrega</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, styles.btnShare]} onPress={handleShare}>
          <Text style={styles.btnText}>Compartir ruta</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal mapa fullscreen ── */}
      <Modal visible={fullMap} animationType="slide" statusBarTranslucent>
        <View style={styles.fullMapContainer}>
          {mapRegion && (
            <MapBoundary fallback={
              <View style={styles.center}>
                <Text>Error al cargar el mapa.</Text>
                <TouchableOpacity style={styles.openMapsBtn} onPress={openInGoogleMaps}>
                  <Text style={styles.openMapsBtnText}>Abrir en Google Maps</Text>
                </TouchableOpacity>
              </View>
            }>
              <MapContent height={SCREEN_H} />
            </MapBoundary>
          )}
          {/* Overlay superior */}
          <View style={styles.fullMapOverlay}>
            <TouchableOpacity style={styles.fullMapClose} onPress={() => setFullMap(false)}>
              <Text style={styles.fullMapCloseText}>✕ Cerrar</Text>
            </TouchableOpacity>
            {currentETA && (
              <View style={styles.fullMapETA}>
                <Text style={styles.fullMapETAText}>
                  {currentETA.distKm} km · {currentETA.minutes} min estimados
                </Text>
              </View>
            )}
          </View>
          {/* Botón navegar */}
          <TouchableOpacity style={styles.fullMapNavBtn} onPress={openInGoogleMaps}>
            <Text style={styles.fullMapNavText}>Iniciar navegación GPS</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Modal documento ── */}
      <Modal visible={docModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Subir documento</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Tipo de documento</Text>
              <View style={styles.typeGrid}>
                {DOC_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.typeChip, docType === t.value && styles.typeChipActive]}
                    onPress={() => setDocType(t.value)}>
                    <Text style={[styles.typeChipText, docType === t.value && {color: '#fff'}]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.label, {marginTop: 14}]}>Nombre del destinatario *</Text>
              <TextInput style={styles.input} placeholder="Nombre y apellido"
                value={recipientName} onChangeText={setRecipientName} />
              <Text style={[styles.label, {marginTop: 10}]}>Teléfono</Text>
              <TextInput style={styles.input} placeholder="Número de teléfono"
                value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" />
              <Text style={[styles.label, {marginTop: 10}]}>Dirección</Text>
              <TextInput style={styles.input} placeholder="Dirección del destinatario"
                value={recipientAddr} onChangeText={setRecipientAddr} />
              <TouchableOpacity style={styles.photoBtn} onPress={pickDocPhoto}>
                <Text style={styles.photoBtnText}>
                  {docPhoto ? '📷 Imagen adjuntada — cambiar' : '📷 Tomar foto del documento *'}
                </Text>
              </TouchableOpacity>
              {docPhoto && <Image source={{uri: docPhoto.uri}} style={styles.preview} resizeMode="cover" />}
            </ScrollView>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setDocModal(false); resetDocForm(); }}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, docSubmitting && {opacity: 0.6}]}
                onPress={handleDocSubmit} disabled={docSubmitting}>
                {docSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Subir</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

function Row({label, value, valueColor}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor && {color: valueColor}]}>{value}</Text>
    </View>
  );
}

function InfoBlock({icon, label, children}) {
  return (
    <View style={styles.infoBlock}>
      <View style={styles.infoBlockLeft}>
        <Text style={styles.infoIcon}>{icon}</Text>
      </View>
      <View style={styles.infoBlockRight}>
        <Text style={styles.infoLabel}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

function _docLabel(type) {
  const map = {delivery_note: 'Guía de remisión', invoice: 'Factura', receipt: 'Recibo', other: 'Otro'};
  return map[type] || type;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F6FA'},
  content:   {padding: 16, gap: 14, paddingBottom: 40},
  center:    {flex: 1, justifyContent: 'center', alignItems: 'center'},

  // Header
  header:        {backgroundColor: '#fff', borderRadius: 16, padding: 16,
                  shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3},
  headerTop:     {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'},
  headerNumber:  {fontSize: 18, fontWeight: '800', color: '#1a1a2e'},
  headerDate:    {fontSize: 12, color: '#AAA', marginTop: 2},

  statusChip:        {borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#EEE'},
  chipCompleted:     {backgroundColor: '#D1FAE5'},
  chipInTransit:     {backgroundColor: '#EDE9FE'},
  chipApproved:      {backgroundColor: '#FEF3C7'},
  chipDeviated:      {backgroundColor: '#FEE2E2'},
  statusChipText:    {fontSize: 12, fontWeight: '700', color: '#444'},

  gpsBar:       {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
                 backgroundColor: '#F5F6FA', borderRadius: 8, padding: 8},
  gpsDot:       {width: 7, height: 7, borderRadius: 4},
  gpsBarText:   {fontSize: 11, color: '#666'},

  // Info blocks
  infoBlock:      {flexDirection: 'row', gap: 12, paddingVertical: 10,
                   borderBottomWidth: 1, borderBottomColor: '#F5F5F5'},
  infoBlockLeft:  {width: 28, alignItems: 'center', paddingTop: 1},
  infoBlockRight: {flex: 1},
  infoIcon:       {fontSize: 16},
  infoLabel:      {fontSize: 11, color: '#AAA', fontWeight: '600', marginBottom: 2},
  infoValue:      {fontSize: 13, color: '#333', fontWeight: '500'},
  infoLink:       {fontSize: 11, color: '#534AB7', fontWeight: '600', marginTop: 2},
  idRow:          {paddingTop: 10, alignItems: 'flex-end'},
  idText:         {fontSize: 10, color: '#CCC', fontFamily: 'monospace'},

  etaCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  etaItem:    {alignItems: 'center'},
  etaLabel:   {fontSize: 11, color: '#AAA', marginBottom: 2},
  etaValue:   {fontSize: 16, fontWeight: '700', color: '#333'},
  etaDivider: {width: 1, height: 32, backgroundColor: '#EEE'},

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardAlert: {borderWidth: 1.5, borderColor: '#D85A30'},

  sectionTitle: {fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 12},
  waiting:      {fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 8},

  row:       {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
              borderBottomWidth: 1, borderBottomColor: '#F0F0F0'},
  rowLabel:  {fontSize: 13, color: '#888', flex: 1},
  rowValue:  {fontSize: 13, color: '#333', fontWeight: '500', flex: 2, textAlign: 'right'},
  rowBetween:{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},

  toggleMapBtn:  {backgroundColor: '#F0F0F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6},
  toggleMapText: {color: '#534AB7', fontSize: 12, fontWeight: '600'},

  map: {width: '100%', borderRadius: 10, marginTop: 4},

  mapFallback:     {height: 120, borderRadius: 10, backgroundColor: '#F0F0F5', justifyContent: 'center', alignItems: 'center', marginTop: 4},
  mapFallbackText: {color: '#888', fontSize: 13, marginBottom: 8},
  openMapsBtn:     {backgroundColor: '#EEEDFE', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8, alignItems: 'center'},
  openMapsBtnText: {color: '#534AB7', fontWeight: '600', fontSize: 13},

  scanBtn:     {backgroundColor: '#1D9E75', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8},
  scanBtnText: {color: '#fff', fontSize: 13, fontWeight: '600'},

  docItem: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0'},
  docType: {fontSize: 13, color: '#444', fontWeight: '500'},
  docSub:  {fontSize: 11, color: '#AAA', marginTop: 2},
  docDate: {fontSize: 12, color: '#AAA'},

  actions:     {gap: 10, marginTop: 4},
  btn:         {borderRadius: 12, padding: 16, alignItems: 'center'},
  btnStart:    {backgroundColor: '#534AB7'},
  btnComplete: {backgroundColor: '#1D9E75'},
  btnShare:    {backgroundColor: '#F0F0F5'},
  btnText:     {color: '#fff', fontSize: 16, fontWeight: '600'},

  // Fullscreen map
  fullMapContainer: {flex: 1, backgroundColor: '#000'},
  fullMapOverlay:   {position: 'absolute', top: 44, left: 0, right: 0, flexDirection: 'row',
                     justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16},
  fullMapClose:     {backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8},
  fullMapCloseText: {color: '#fff', fontWeight: '600'},
  fullMapETA:       {backgroundColor: 'rgba(83,74,183,0.9)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8},
  fullMapETAText:   {color: '#fff', fontSize: 13, fontWeight: '600'},
  fullMapNavBtn:    {position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#534AB7',
                     borderRadius: 28, paddingHorizontal: 32, paddingVertical: 16,
                     shadowColor: '#534AB7', shadowOpacity: 0.4, shadowRadius: 10, elevation: 8},
  fullMapNavText:   {color: '#fff', fontWeight: '700', fontSize: 16},

  // Modal documento
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet:   {backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%'},
  sheetTitle: {fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 16},
  label:   {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  input:   {borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 12, fontSize: 14, color: '#333'},
  typeGrid:       {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  typeChip:       {borderRadius: 20, borderWidth: 1.5, borderColor: '#DDD', paddingHorizontal: 12, paddingVertical: 6},
  typeChipActive: {backgroundColor: '#534AB7', borderColor: '#534AB7'},
  typeChipText:   {fontSize: 12, color: '#555'},
  photoBtn:       {marginTop: 12, backgroundColor: '#F0F0F5', borderRadius: 10, padding: 14, alignItems: 'center'},
  photoBtnText:   {color: '#534AB7', fontWeight: '600', fontSize: 13},
  preview:        {width: '100%', height: 160, borderRadius: 10, marginTop: 10},
  sheetActions:   {flexDirection: 'row', gap: 10, marginTop: 16},
  cancelBtn:      {flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#DDD', padding: 14, alignItems: 'center'},
  cancelText:     {color: '#555', fontWeight: '600'},
  submitBtn:      {flex: 2, borderRadius: 12, backgroundColor: '#534AB7', padding: 14, alignItems: 'center'},
  submitText:     {color: '#fff', fontWeight: '700', fontSize: 15},
});

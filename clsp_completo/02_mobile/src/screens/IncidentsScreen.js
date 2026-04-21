import React, {useState, useCallback} from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, ActivityIndicator,
  Alert, Image,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {useAuthStore} from '../store';
import api from '../services/api';
import Toast from 'react-native-toast-message';

const TYPES = [
  {value: 'accident',  label: 'Accidente'},
  {value: 'breakdown', label: 'Avería del vehículo'},
  {value: 'traffic',   label: 'Tráfico / Congestión'},
  {value: 'manual',    label: 'Otro / Reporte manual'},
];

const TYPE_COLORS = {
  accident:  '#D85A30',
  breakdown: '#B8860B',
  traffic:   '#534AB7',
  manual:    '#555',
  deviation: '#D85A30',
  stop:      '#B8860B',
  speed:     '#CC3311',
};

export default function IncidentsScreen() {
  const [incidents,  setIncidents]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModal]    = useState(false);

  // Form state
  const [services,    setServices]    = useState([]);
  const [serviceId,   setServiceId]   = useState('');
  const [type,        setType]        = useState('manual');
  const [description, setDescription] = useState('');
  const [photo,       setPhoto]       = useState(null);
  const [submitting,  setSubmitting]  = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [incRes, svcRes] = await Promise.all([
        api.get('/incidents/my_incidents/'),
        api.get('/services/', {params: {ordering: '-created_at'}}),
      ]);
      setIncidents(incRes.data);
      const actives = (svcRes.data.results || svcRes.data).filter(
        s => ['approved', 'in_transit'].includes(s.status),
      );
      setServices(actives);
      if (actives.length > 0) setServiceId(actives[0].id);
    } catch (err) {
      console.error('[Incidents]', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const pickPhoto = () => {
    Alert.alert('Adjuntar foto', '¿Cómo deseas adjuntar la foto?', [
      {
        text: 'Cámara',
        onPress: async () => {
          const r = await launchCamera({mediaType: 'photo', quality: 0.8});
          if (!r.didCancel && r.assets?.[0]) setPhoto(r.assets[0]);
        },
      },
      {
        text: 'Galería',
        onPress: async () => {
          const r = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
          if (!r.didCancel && r.assets?.[0]) setPhoto(r.assets[0]);
        },
      },
      {text: 'Cancelar', style: 'cancel'},
    ]);
  };

  const handleSubmit = async () => {
    if (!serviceId) {
      Alert.alert('Error', 'Selecciona un servicio activo.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Escribe una descripción de la incidencia.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('service', serviceId);
      formData.append('type', type);
      formData.append('description', description.trim());
      if (photo) {
        formData.append('photo', {
          uri:  photo.uri,
          type: photo.type || 'image/jpeg',
          name: photo.fileName || `incident_${Date.now()}.jpg`,
        });
      }
      await api.post('/incidents/', formData, {
        headers: {'Content-Type': 'multipart/form-data'},
      });
      Toast.show({type: 'success', text1: 'Incidencia reportada', text2: 'El administrador fue notificado.'});
      setModal(false);
      setDescription('');
      setPhoto(null);
      setType('manual');
      fetchData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'No se pudo enviar el reporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderIncident = ({item}) => {
    const color = TYPE_COLORS[item.type] || '#555';
    const typeLabel = TYPES.find(t => t.value === item.type)?.label || item.type;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, {backgroundColor: color + '20'}]}>
            <Text style={[styles.typeText, {color}]}>{typeLabel}</Text>
          </View>
          {item.resolved
            ? <Text style={styles.resolved}>✓ Resuelta</Text>
            : <Text style={styles.pending}>Pendiente</Text>}
        </View>
        <Text style={styles.desc}>{item.description || '(Sin descripción)'}</Text>
        {item.photo_url && (
          <Image source={{uri: item.photo_url}} style={styles.thumb} resizeMode="cover" />
        )}
        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleDateString('es-PE', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={incidents}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); fetchData(); }}
        ListEmptyComponent={
          loading
            ? <ActivityIndicator size="large" color="#534AB7" style={{marginTop: 40}} />
            : <Text style={styles.empty}>No tienes incidencias reportadas.</Text>
        }
        renderItem={renderIncident}
      />

      {/* FAB — reportar */}
      <TouchableOpacity style={styles.fab} onPress={() => setModal(true)}>
        <Text style={styles.fabText}>+ Reportar</Text>
      </TouchableOpacity>

      {/* Modal de reporte */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Reportar incidencia</Text>
            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Servicio */}
              <Text style={styles.label}>Servicio activo</Text>
              {services.length === 0
                ? <Text style={styles.noService}>No tienes servicios activos en este momento.</Text>
                : services.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.optBtn, serviceId === s.id && styles.optBtnActive]}
                      onPress={() => setServiceId(s.id)}>
                      <Text style={[styles.optText, serviceId === s.id && {color: '#fff'}]}>
                        #{s.number ? String(s.number).padStart(4, '0') : s.id.slice(-6).toUpperCase()}
                        {' · '}{s.status === 'in_transit' ? 'En tránsito' : 'Aprobado'}
                      </Text>
                    </TouchableOpacity>
                  ))
              }

              {/* Tipo */}
              <Text style={[styles.label, {marginTop: 14}]}>Tipo de incidencia</Text>
              <View style={styles.typeGrid}>
                {TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.typeChip, type === t.value && styles.typeChipActive]}
                    onPress={() => setType(t.value)}>
                    <Text style={[styles.typeChipText, type === t.value && {color: '#fff'}]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Descripción */}
              <Text style={[styles.label, {marginTop: 14}]}>Descripción</Text>
              <TextInput
                style={styles.textarea}
                multiline
                numberOfLines={4}
                placeholder="Describe qué ocurrió..."
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
              />

              {/* Foto */}
              <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
                <Text style={styles.photoBtnText}>
                  {photo ? '📷 Foto adjuntada — cambiar' : '📷 Adjuntar foto (opcional)'}
                </Text>
              </TouchableOpacity>
              {photo && (
                <Image source={{uri: photo.uri}} style={styles.preview} resizeMode="cover" />
              )}
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && {opacity: 0.6}]}
                onPress={handleSubmit}
                disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitText}>Enviar reporte</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  {flex: 1, backgroundColor: '#F5F6FA'},
  list:       {padding: 16, gap: 12, paddingBottom: 90},
  empty:      {textAlign: 'center', color: '#999', marginTop: 60, fontSize: 15},

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  typeBadge:  {borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4},
  typeText:   {fontSize: 12, fontWeight: '600'},
  resolved:   {fontSize: 12, color: '#1D9E75', fontWeight: '600'},
  pending:    {fontSize: 12, color: '#B8860B', fontWeight: '600'},
  desc:       {fontSize: 14, color: '#444', marginBottom: 8},
  thumb:      {width: '100%', height: 140, borderRadius: 8, marginBottom: 8},
  date:       {fontSize: 11, color: '#AAA', textAlign: 'right'},

  fab: {
    position: 'absolute', bottom: 24, right: 20,
    backgroundColor: '#534AB7', borderRadius: 28,
    paddingHorizontal: 22, paddingVertical: 14,
    shadowColor: '#534AB7', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  fabText: {color: '#fff', fontWeight: '700', fontSize: 15},

  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '90%',
  },
  sheetTitle: {fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 16},

  label:     {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  noService: {color: '#999', fontSize: 13, marginBottom: 8},

  optBtn:       {borderRadius: 8, borderWidth: 1.5, borderColor: '#DDD', padding: 10, marginBottom: 6},
  optBtnActive: {backgroundColor: '#534AB7', borderColor: '#534AB7'},
  optText:      {fontSize: 13, color: '#444'},

  typeGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  typeChip: {
    borderRadius: 20, borderWidth: 1.5, borderColor: '#DDD',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  typeChipActive: {backgroundColor: '#534AB7', borderColor: '#534AB7'},
  typeChipText:   {fontSize: 12, color: '#555'},

  textarea: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 10,
    padding: 12, fontSize: 14, minHeight: 90, color: '#333',
  },
  photoBtn:     {marginTop: 12, backgroundColor: '#F0F0F5', borderRadius: 10, padding: 14, alignItems: 'center'},
  photoBtnText: {color: '#534AB7', fontWeight: '600', fontSize: 13},
  preview:      {width: '100%', height: 160, borderRadius: 10, marginTop: 10},

  sheetActions: {flexDirection: 'row', gap: 10, marginTop: 16},
  cancelBtn:    {flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#DDD', padding: 14, alignItems: 'center'},
  cancelText:   {color: '#555', fontWeight: '600'},
  submitBtn:    {flex: 2, borderRadius: 12, backgroundColor: '#534AB7', padding: 14, alignItems: 'center'},
  submitText:   {color: '#fff', fontWeight: '700', fontSize: 15},
});

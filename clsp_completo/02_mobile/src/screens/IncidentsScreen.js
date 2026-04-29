import React, {useState, useCallback} from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, ActivityIndicator,
  Alert, Image,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import api from '../services/api';
import Toast from 'react-native-toast-message';
import {useTheme} from '../context/ThemeContext';

const TYPES = [
  {value: 'accident',  label: 'Accidente'},
  {value: 'breakdown', label: 'Avería del vehículo'},
  {value: 'traffic',   label: 'Tráfico / Congestión'},
  {value: 'manual',    label: 'Otro / Reporte manual'},
];

const TYPE_COLORS = {
  accident: '#D85A30', breakdown: '#B8860B', traffic: '#534AB7',
  manual: '#555', deviation: '#D85A30', stop: '#B8860B', speed: '#CC3311',
};

export default function IncidentsScreen() {
  const {colors: c} = useTheme();
  const [incidents,  setIncidents]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModal]    = useState(false);

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
      {text: 'Cámara', onPress: async () => {
        const r = await launchCamera({mediaType: 'photo', quality: 0.8});
        if (!r.didCancel && r.assets?.[0]) setPhoto(r.assets[0]);
      }},
      {text: 'Galería', onPress: async () => {
        const r = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
        if (!r.didCancel && r.assets?.[0]) setPhoto(r.assets[0]);
      }},
      {text: 'Cancelar', style: 'cancel'},
    ]);
  };

  const handleSubmit = async () => {
    if (!serviceId) { Alert.alert('Error', 'Selecciona un servicio activo.'); return; }
    if (!description.trim()) { Alert.alert('Error', 'Escribe una descripción.'); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('service', serviceId);
      formData.append('type', type);
      formData.append('description', description.trim());
      if (photo) {
        formData.append('photo', {uri: photo.uri, type: photo.type || 'image/jpeg', name: photo.fileName || `inc_${Date.now()}.jpg`});
      }
      await api.post('/incidents/', formData, {headers: {'Content-Type': 'multipart/form-data'}});
      Toast.show({type: 'success', text1: 'Incidencia reportada', text2: 'El administrador fue notificado.'});
      setModal(false); setDescription(''); setPhoto(null); setType('manual');
      fetchData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'No se pudo enviar el reporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderIncident = ({item}) => {
    const color     = TYPE_COLORS[item.type] || '#555';
    const typeLabel = TYPES.find(t => t.value === item.type)?.label || item.type;
    return (
      <View style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <View style={s.cardHeader}>
          <View style={[s.typeBadge, {backgroundColor: color + '20'}]}>
            <Text style={[s.typeText, {color}]}>{typeLabel}</Text>
          </View>
          {item.resolved
            ? <Text style={[s.resolved, {color: c.success}]}>✓ Resuelta</Text>
            : <Text style={[s.pending, {color: '#B8860B'}]}>Pendiente</Text>}
        </View>
        <Text style={[s.desc, {color: c.text}]}>{item.description || '(Sin descripción)'}</Text>
        {item.photo_url && (
          <Image source={{uri: item.photo_url}} style={s.thumb} resizeMode="cover" />
        )}

        {/* Respuesta del administrador */}
        {item.resolved && (
          <View style={[s.adminReply, {backgroundColor: c.primaryBg, borderLeftColor: c.primary}]}>
            <Text style={[s.adminReplyLabel, {color: c.primary}]}>💬 Respuesta del administrador</Text>
            <Text style={[s.adminReplyText, {color: c.text}]}>
              {item.admin_comment || 'Incidencia resuelta sin comentarios adicionales.'}
            </Text>
            {item.resolved_by_name && (
              <Text style={[s.adminReplyAuthor, {color: c.hint}]}>— {item.resolved_by_name}</Text>
            )}
          </View>
        )}

        <Text style={[s.date, {color: c.hint}]}>
          {new Date(item.created_at).toLocaleDateString('es-PE', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  return (
    <View style={[s.container, {backgroundColor: c.bg}]}>
      <FlatList
        data={incidents}
        keyExtractor={i => i.id}
        contentContainerStyle={s.list}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); fetchData(); }}
        ListEmptyComponent={
          loading
            ? <ActivityIndicator size="large" color={c.primary} style={{marginTop: 40}} />
            : <Text style={[s.empty, {color: c.hint}]}>No tienes incidencias reportadas.</Text>
        }
        renderItem={renderIncident}
      />

      <TouchableOpacity style={[s.fab, {backgroundColor: c.primary}]} onPress={() => setModal(true)}>
        <Text style={s.fabText}>+ Reportar</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={[s.sheet, {backgroundColor: c.sheet}]}>
            <Text style={[s.sheetTitle, {color: c.text}]}>Reportar incidencia</Text>
            <ScrollView showsVerticalScrollIndicator={false}>

              <Text style={[s.label, {color: c.subtext}]}>Servicio activo</Text>
              {services.length === 0
                ? <Text style={[s.noService, {color: c.hint}]}>No tienes servicios activos.</Text>
                : services.map(sv => (
                    <TouchableOpacity
                      key={sv.id}
                      style={[s.optBtn, {borderColor: c.inputBorder}, serviceId === sv.id && {backgroundColor: c.primary, borderColor: c.primary}]}
                      onPress={() => setServiceId(sv.id)}>
                      <Text style={[s.optText, {color: serviceId === sv.id ? '#fff' : c.text}]}>
                        #{sv.number ? String(sv.number).padStart(4,'0') : sv.id.slice(-6).toUpperCase()}
                        {' · '}{sv.status === 'in_transit' ? 'En tránsito' : 'Aprobado'}
                      </Text>
                    </TouchableOpacity>
                  ))
              }

              <Text style={[s.label, {color: c.subtext, marginTop: 14}]}>Tipo</Text>
              <View style={s.typeGrid}>
                {TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.typeChip, {borderColor: c.inputBorder}, type === t.value && {backgroundColor: c.primary, borderColor: c.primary}]}
                    onPress={() => setType(t.value)}>
                    <Text style={[s.typeChipText, {color: type === t.value ? '#fff' : c.subtext}]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, {color: c.subtext, marginTop: 14}]}>Descripción</Text>
              <TextInput
                style={[s.textarea, {borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text}]}
                multiline numberOfLines={4}
                placeholder="Describe qué ocurrió..."
                placeholderTextColor={c.hint}
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
              />

              <TouchableOpacity style={[s.photoBtn, {backgroundColor: c.primaryBg}]} onPress={pickPhoto}>
                <Text style={[s.photoBtnText, {color: c.primary}]}>
                  {photo ? '📷 Foto adjuntada — cambiar' : '📷 Adjuntar foto (opcional)'}
                </Text>
              </TouchableOpacity>
              {photo && <Image source={{uri: photo.uri}} style={s.preview} resizeMode="cover" />}
            </ScrollView>

            <View style={s.sheetActions}>
              <TouchableOpacity style={[s.cancelBtn, {borderColor: c.inputBorder}]} onPress={() => setModal(false)}>
                <Text style={[s.cancelText, {color: c.subtext}]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, {backgroundColor: c.primary}, submitting && {opacity: 0.6}]}
                onPress={handleSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Enviar reporte</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {flex: 1},
  list:      {padding: 16, gap: 12, paddingBottom: 90},
  empty:     {textAlign: 'center', marginTop: 60, fontSize: 15},
  card:      {borderRadius: 14, padding: 16, borderWidth: 1,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2},
  cardHeader:{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  typeBadge: {borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4},
  typeText:  {fontSize: 12, fontWeight: '600'},
  resolved:  {fontSize: 12, fontWeight: '600'},
  pending:   {fontSize: 12, fontWeight: '600'},
  desc:      {fontSize: 14, marginBottom: 8},
  thumb:     {width: '100%', height: 140, borderRadius: 8, marginBottom: 8},
  date:      {fontSize: 11, textAlign: 'right'},
  adminReply:{borderLeftWidth: 3, borderRadius: 8, padding: 10, marginBottom: 8},
  adminReplyLabel: {fontSize: 11, fontWeight: '700', marginBottom: 4},
  adminReplyText:  {fontSize: 13, lineHeight: 19},
  adminReplyAuthor:{fontSize: 11, marginTop: 4, fontStyle: 'italic'},
  fab:       {position: 'absolute', bottom: 24, right: 20, borderRadius: 28,
              paddingHorizontal: 22, paddingVertical: 14,
              shadowOpacity: 0.4, shadowRadius: 8, elevation: 6},
  fabText:   {color: '#fff', fontWeight: '700', fontSize: 15},
  overlay:   {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet:     {borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%'},
  sheetTitle:{fontSize: 18, fontWeight: '700', marginBottom: 16},
  label:     {fontSize: 13, fontWeight: '600', marginBottom: 6},
  noService: {fontSize: 13, marginBottom: 8},
  optBtn:    {borderRadius: 8, borderWidth: 1.5, padding: 10, marginBottom: 6},
  optText:   {fontSize: 13},
  typeGrid:  {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  typeChip:  {borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6},
  typeChipText:{fontSize: 12},
  textarea:  {borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 90},
  photoBtn:  {marginTop: 12, borderRadius: 10, padding: 14, alignItems: 'center'},
  photoBtnText:{fontWeight: '600', fontSize: 13},
  preview:   {width: '100%', height: 160, borderRadius: 10, marginTop: 10},
  sheetActions:{flexDirection: 'row', gap: 10, marginTop: 16},
  cancelBtn: {flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 14, alignItems: 'center'},
  cancelText:{fontWeight: '600'},
  submitBtn: {flex: 2, borderRadius: 12, padding: 14, alignItems: 'center'},
  submitText:{color: '#fff', fontWeight: '700', fontSize: 15},
});

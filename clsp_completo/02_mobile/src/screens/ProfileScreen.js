import React, {useState, useEffect, useCallback} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, Image, TextInput, Modal,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {useFocusEffect} from '@react-navigation/native';
import {useAuthStore} from '../store';
import api from '../services/api';
import Toast from 'react-native-toast-message';
import {useTheme} from '../context/ThemeContext';

const VEHICLE_STATUS = {
  active:      {label: 'Activo',          color: '#1D9E75'},
  maintenance: {label: 'En mantenimiento',color: '#B8860B'},
  inactive:    {label: 'Inactivo',        color: '#888'},
};

export default function ProfileScreen() {
  const user    = useAuthStore(s => s.user);
  const logout  = useAuthStore(s => s.logout);
  const setUser = useAuthStore(s => s.setUser);
  const {colors: c} = useTheme();

  const [editModal,   setEditModal]   = useState(false);
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [address,     setAddress]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [vehicle,     setVehicle]     = useState(null);
  const [vLoading,    setVLoading]    = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const fetchVehicle = useCallback(async () => {
    try {
      const {data} = await api.get('/users/my_vehicle/');
      setVehicle(data);
    } catch {
      setVehicle(null);
    } finally {
      setVLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchVehicle(); }, [fetchVehicle]));

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Deseas salir de tu cuenta?', [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Salir', style: 'destructive', onPress: logout},
    ]);
  };

  const pickAvatar = () => {
    Alert.alert('Cambiar foto', '¿Cómo deseas subir tu foto?', [
      {text: 'Cámara', onPress: async () => {
        const r = await launchCamera({mediaType: 'photo', quality: 0.8});
        if (!r.didCancel && r.assets?.[0]) uploadAvatar(r.assets[0]);
      }},
      {text: 'Galería', onPress: async () => {
        const r = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
        if (!r.didCancel && r.assets?.[0]) uploadAvatar(r.assets[0]);
      }},
      {text: 'Cancelar', style: 'cancel'},
    ]);
  };

  const uploadAvatar = async (photo) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', {
        uri:  photo.uri,
        type: photo.type || 'image/jpeg',
        name: photo.fileName || `avatar_${Date.now()}.jpg`,
      });
      const {data} = await api.post('/users/upload_avatar/', formData, {
        headers: {'Content-Type': 'multipart/form-data'},
      });
      // Actualizar store y persistir en AsyncStorage
      setUser(data);
      const stored = await AsyncStorage.getItem('user');
      const parsed = stored ? JSON.parse(stored) : {};
      await AsyncStorage.setItem('user', JSON.stringify({...parsed, ...data}));
      Toast.show({type: 'success', text1: 'Foto actualizada'});
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto. Verifica la conexión.');
    } finally {
      setUploading(false);
    }
  };

  const openEdit = () => {
    setFirstName(user?.first_name || '');
    setLastName(user?.last_name   || '');
    setPhone(user?.phone          || '');
    setAddress(user?.address      || '');
    setEditModal(true);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const {data} = await api.patch('/users/me/', {
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        phone:      phone.trim(),
        address:    address.trim(),
      });
      setUser(data);
      const stored = await AsyncStorage.getItem('user');
      const parsed = stored ? JSON.parse(stored) : {};
      await AsyncStorage.setItem('user', JSON.stringify({...parsed, ...data}));
      Toast.show({type: 'success', text1: 'Perfil actualizado'});
      setEditModal(false);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase() || '?';

  return (
    <ScrollView
      style={[s.container, {backgroundColor: c.bg}]}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchVehicle(); }} colors={[c.primary]} />
      }>

      {/* Avatar */}
      <TouchableOpacity onPress={pickAvatar} disabled={uploading} style={s.avatarWrapper}>
        {user?.avatar_url ? (
          <Image source={{uri: user.avatar_url}} style={[s.avatarImg, {borderColor: c.primary}]} />
        ) : (
          <View style={[s.avatarCircle, {backgroundColor: c.primary}]}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
        )}
        {uploading ? (
          <ActivityIndicator style={s.avatarOverlay} color="#fff" />
        ) : (
          <View style={[s.editBadge, {backgroundColor: c.primary}]}>
            <Text style={s.editBadgeText}>✎</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={[s.name, {color: c.text}]}>{user?.full_name || user?.email}</Text>
      <View style={[s.roleBadge, {backgroundColor: c.primaryBg}]}>
        <Text style={[s.roleText, {color: c.primary}]}>🏍 Motorizado</Text>
      </View>

      {/* Info personal */}
      <View style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <Text style={[s.cardTitle, {color: c.hint}]}>Información personal</Text>
        <InfoRow icon="✉"  label="Correo"    value={user?.email}   c={c} />
        <InfoRow icon="☎"  label="Teléfono"  value={user?.phone || '—'} c={c} />
        <InfoRow icon="🏠" label="Dirección" value={user?.address || '—'} c={c} />
      </View>

      {/* Vehículo asignado */}
      <View style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <Text style={[s.cardTitle, {color: c.hint}]}>Vehículo asignado</Text>
        {vLoading ? (
          <ActivityIndicator color={c.primary} style={{marginVertical: 12}} />
        ) : vehicle ? (
          <>
            <View style={s.vehicleHeader}>
              <Text style={s.vehicleIcon}>🏍</Text>
              <View style={{flex: 1}}>
                <Text style={[s.vehicleName, {color: c.text}]}>
                  {vehicle.brand} {vehicle.model} {vehicle.year}
                </Text>
                <Text style={[s.vehiclePlate, {color: c.primary}]}>{vehicle.plate}</Text>
              </View>
              <View style={[s.vehicleStatus, {backgroundColor: (VEHICLE_STATUS[vehicle.status]?.color || '#888') + '20'}]}>
                <Text style={[s.vehicleStatusText, {color: VEHICLE_STATUS[vehicle.status]?.color || '#888'}]}>
                  {VEHICLE_STATUS[vehicle.status]?.label || vehicle.status}
                </Text>
              </View>
            </View>
            {vehicle.notes ? (
              <Text style={[s.vehicleNotes, {color: c.hint}]}>{vehicle.notes}</Text>
            ) : null}
            <View style={[s.vehicleStats, {borderTopColor: c.separator}]}>
              <VehicleStat label="Km recorridos" value={`${(vehicle.mileage || 0).toLocaleString()} km`} c={c} />
              <VehicleStat label="Rendimiento"   value={`${vehicle.fuel_consumption_rate || '—'} km/l`} c={c} />
            </View>
          </>
        ) : (
          <Text style={[s.noVehicle, {color: c.hint}]}>No tienes un vehículo asignado actualmente.</Text>
        )}
      </View>

      <TouchableOpacity style={[s.editBtn, {backgroundColor: c.primaryBg}]} onPress={openEdit}>
        <Text style={[s.editBtnText, {color: c.primary}]}>Editar perfil</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.logoutBtn, {backgroundColor: c.dangerBg}]} onPress={handleLogout}>
        <Text style={[s.logoutText, {color: c.danger}]}>Cerrar sesión</Text>
      </TouchableOpacity>

      {/* Modal editar perfil */}
      <Modal visible={editModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={[s.sheet, {backgroundColor: c.sheet}]}>
            <Text style={[s.sheetTitle, {color: c.text}]}>Editar perfil</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Field label="Nombre"    value={firstName} onChange={setFirstName} placeholder="Nombre"    c={c} />
              <Field label="Apellido"  value={lastName}  onChange={setLastName}  placeholder="Apellido"  c={c} mt />
              <Field label="Teléfono"  value={phone}     onChange={setPhone}     placeholder="Teléfono"  c={c} mt keyboard="phone-pad" />
              <Field label="Dirección" value={address}   onChange={setAddress}   placeholder="Dirección" c={c} mt />
            </ScrollView>
            <View style={s.sheetActions}>
              <TouchableOpacity style={[s.cancelBtn, {borderColor: c.inputBorder}]} onPress={() => setEditModal(false)}>
                <Text style={[s.cancelText, {color: c.subtext}]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, {backgroundColor: c.primary}, saving && {opacity: 0.6}]}
                onPress={handleSaveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({icon, label, value, c}) {
  return (
    <View style={[s.infoRow, {borderBottomColor: c.separator}]}>
      <Text style={s.infoIcon}>{icon}</Text>
      <View>
        <Text style={[s.infoLabel, {color: c.hint}]}>{label}</Text>
        <Text style={[s.infoValue, {color: c.text}]}>{value}</Text>
      </View>
    </View>
  );
}

function VehicleStat({label, value, c}) {
  return (
    <View style={s.vehicleStatItem}>
      <Text style={[s.vehicleStatLabel, {color: c.hint}]}>{label}</Text>
      <Text style={[s.vehicleStatValue, {color: c.text}]}>{value}</Text>
    </View>
  );
}

function Field({label, value, onChange, placeholder, c, mt, keyboard}) {
  return (
    <View style={mt ? {marginTop: 10} : {}}>
      <Text style={[s.label, {color: c.subtext}]}>{label}</Text>
      <TextInput
        style={[s.input, {borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text}]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.hint}
        keyboardType={keyboard || 'default'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {flex: 1},
  content:   {alignItems: 'center', padding: 24, gap: 14, paddingBottom: 40},
  avatarWrapper: {marginTop: 16, position: 'relative'},
  avatarImg:     {width: 90, height: 90, borderRadius: 45, borderWidth: 3},
  avatarCircle:  {width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center'},
  avatarText:    {color: '#fff', fontSize: 28, fontWeight: '700'},
  avatarOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 45,
                  justifyContent: 'center', alignItems: 'center'},
  editBadge:     {position: 'absolute', bottom: 2, right: 2, borderRadius: 12,
                  width: 24, height: 24, justifyContent: 'center', alignItems: 'center',
                  borderWidth: 2, borderColor: '#fff'},
  editBadgeText: {color: '#fff', fontSize: 12},
  name:      {fontSize: 22, fontWeight: '700'},
  roleBadge: {borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5},
  roleText:  {fontWeight: '600', fontSize: 13},
  card:      {borderRadius: 14, padding: 16, width: '100%', borderWidth: 1,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2},
  cardTitle: {fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10},
  infoRow:   {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1},
  infoIcon:  {fontSize: 18},
  infoLabel: {fontSize: 11, marginBottom: 2},
  infoValue: {fontSize: 14, fontWeight: '500'},
  vehicleHeader:     {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8},
  vehicleIcon:       {fontSize: 28},
  vehicleName:       {fontSize: 15, fontWeight: '700'},
  vehiclePlate:      {fontSize: 13, fontWeight: '600', letterSpacing: 1, marginTop: 2},
  vehicleStatus:     {borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4},
  vehicleStatusText: {fontSize: 11, fontWeight: '600'},
  vehicleNotes:      {fontSize: 12, fontStyle: 'italic', marginBottom: 8},
  vehicleStats:      {flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, borderTopWidth: 1, marginTop: 4},
  vehicleStatItem:   {alignItems: 'center'},
  vehicleStatLabel:  {fontSize: 11},
  vehicleStatValue:  {fontSize: 14, fontWeight: '700', marginTop: 2},
  noVehicle: {fontSize: 13, textAlign: 'center', paddingVertical: 12},
  editBtn:   {borderRadius: 12, padding: 16, width: '100%', alignItems: 'center'},
  editBtnText:{fontWeight: '600', fontSize: 15},
  logoutBtn: {borderRadius: 12, padding: 16, width: '100%', alignItems: 'center'},
  logoutText:{fontWeight: '600', fontSize: 15},
  overlay:   {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet:     {borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%'},
  sheetTitle:{fontSize: 18, fontWeight: '700', marginBottom: 16},
  label:     {fontSize: 13, fontWeight: '600', marginBottom: 6},
  input:     {borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14},
  sheetActions:{flexDirection: 'row', gap: 10, marginTop: 16},
  cancelBtn: {flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 14, alignItems: 'center'},
  cancelText:{fontWeight: '600'},
  submitBtn: {flex: 2, borderRadius: 12, padding: 14, alignItems: 'center'},
  submitText:{color: '#fff', fontWeight: '700', fontSize: 15},
});

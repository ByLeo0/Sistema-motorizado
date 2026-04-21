import React, {useState} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, Image, TextInput, Modal,
  ActivityIndicator,
} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {useAuthStore} from '../store';
import api from '../services/api';
import Toast from 'react-native-toast-message';

export default function ProfileScreen() {
  const user    = useAuthStore(s => s.user);
  const logout  = useAuthStore(s => s.logout);
  const setUser = useAuthStore(s => s.setUser);

  const [editModal,   setEditModal]   = useState(false);
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [address,     setAddress]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Deseas salir de tu cuenta?', [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Salir', style: 'destructive', onPress: logout},
    ]);
  };

  const pickAvatar = () => {
    Alert.alert('Cambiar foto', '¿Cómo deseas subir tu foto?', [
      {
        text: 'Cámara',
        onPress: async () => {
          const r = await launchCamera({mediaType: 'photo', quality: 0.8});
          if (!r.didCancel && r.assets?.[0]) uploadAvatar(r.assets[0]);
        },
      },
      {
        text: 'Galería',
        onPress: async () => {
          const r = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
          if (!r.didCancel && r.assets?.[0]) uploadAvatar(r.assets[0]);
        },
      },
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
      setUser(data);
      Toast.show({type: 'success', text1: 'Foto actualizada'});
    } catch (err) {
      Alert.alert('Error', 'No se pudo subir la foto.');
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
      Toast.show({type: 'success', text1: 'Perfil actualizado'});
      setEditModal(false);
    } catch (err) {
      Alert.alert('Error', 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar */}
      <TouchableOpacity onPress={pickAvatar} disabled={uploading} style={styles.avatarWrapper}>
        {user?.avatar_url ? (
          <Image source={{uri: user.avatar_url}} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user?.first_name?.[0]?.toUpperCase()}{user?.last_name?.[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        {uploading ? (
          <ActivityIndicator style={styles.avatarOverlay} color="#fff" />
        ) : (
          <View style={styles.editBadge}>
            <Text style={styles.editBadgeText}>✎</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.name}>{user?.full_name}</Text>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>Motorizado</Text>
      </View>

      {/* Info card */}
      <View style={styles.card}>
        <InfoRow icon="✉"  label="Correo"    value={user?.email} />
        <InfoRow icon="☎"  label="Teléfono"  value={user?.phone   || '—'} />
        <InfoRow icon="🏠" label="Dirección" value={user?.address || '—'} />
      </View>

      <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
        <Text style={styles.editBtnText}>Editar perfil</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      {/* Edit modal */}
      <Modal visible={editModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Editar perfil</Text>
            <ScrollView showsVerticalScrollIndicator={false}>

              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Nombre"
              />

              <Text style={[styles.label, {marginTop: 10}]}>Apellido</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Apellido"
              />

              <Text style={[styles.label, {marginTop: 10}]}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Teléfono"
                keyboardType="phone-pad"
              />

              <Text style={[styles.label, {marginTop: 10}]}>Dirección</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Dirección"
              />
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModal(false)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, saving && {opacity: 0.6}]}
                onPress={handleSaveProfile}
                disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

function InfoRow({icon, label, value}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F6FA'},
  content:   {alignItems: 'center', padding: 24, gap: 16},

  avatarWrapper: {marginTop: 16, position: 'relative'},
  avatarImg:     {width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#534AB7'},
  avatarCircle:  {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#534AB7', justifyContent: 'center', alignItems: 'center',
  },
  avatarText:    {color: '#fff', fontSize: 28, fontWeight: '700'},
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 45,
    justifyContent: 'center', alignItems: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: '#534AB7', borderRadius: 12, width: 24, height: 24,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff',
  },
  editBadgeText: {color: '#fff', fontSize: 12},

  name:      {fontSize: 22, fontWeight: '700', color: '#222'},
  roleBadge: {backgroundColor: '#EEEDFE', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5},
  roleText:  {color: '#534AB7', fontWeight: '600', fontSize: 13},

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  infoRow:   {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10,
              borderBottomWidth: 1, borderBottomColor: '#F0F0F0'},
  infoIcon:  {fontSize: 18},
  infoLabel: {fontSize: 11, color: '#AAA', marginBottom: 2},
  infoValue: {fontSize: 14, color: '#333', fontWeight: '500'},

  editBtn:     {backgroundColor: '#EEEDFE', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center'},
  editBtnText: {color: '#534AB7', fontWeight: '600', fontSize: 15},
  logoutBtn:   {backgroundColor: '#FEE', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center'},
  logoutText:  {color: '#D85A30', fontWeight: '600', fontSize: 15},

  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '80%',
  },
  sheetTitle: {fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 16},
  label:      {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  input:      {borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 12, fontSize: 14, color: '#333'},

  sheetActions: {flexDirection: 'row', gap: 10, marginTop: 16},
  cancelBtn:    {flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#DDD', padding: 14, alignItems: 'center'},
  cancelText:   {color: '#555', fontWeight: '600'},
  submitBtn:    {flex: 2, borderRadius: 12, backgroundColor: '#534AB7', padding: 14, alignItems: 'center'},
  submitText:   {color: '#fff', fontWeight: '700', fontSize: 15},
});

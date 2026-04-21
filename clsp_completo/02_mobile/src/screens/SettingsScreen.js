import React, {useEffect, useState} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch,
  TouchableOpacity, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuthStore} from '../store';

const SETTINGS_KEY = 'clsp_settings';

const defaults = {
  notificationsEnabled: true,
  darkMode:             false,
  offlineMode:          true,
  soundAlerts:          true,
};

export default function SettingsScreen() {
  const user    = useAuthStore(s => s.user);
  const [cfg, setCfg] = useState(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) setCfg({...defaults, ...JSON.parse(raw)});
    });
  }, []);

  const update = async (key, value) => {
    const next = {...cfg, [key]: value};
    setCfg(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.pageTitle}>Configuración</Text>

      {/* Notificaciones */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notificaciones</Text>
        <SettingRow
          label="Activar notificaciones"
          description="Recibe alertas de nuevos servicios, cambios de estado y desvíos"
          value={cfg.notificationsEnabled}
          onToggle={v => update('notificationsEnabled', v)}
        />
        <SettingRow
          label="Alertas de sonido"
          description="Reproduce sonido al recibir una alerta de desvío de ruta"
          value={cfg.soundAlerts}
          onToggle={v => update('soundAlerts', v)}
        />
        <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openSettings()}>
          <Text style={styles.linkText}>Gestionar permisos del sistema →</Text>
        </TouchableOpacity>
      </View>

      {/* Apariencia */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Apariencia</Text>
        <SettingRow
          label="Modo oscuro"
          description="Usa un tema oscuro en toda la aplicación (requiere reiniciar)"
          value={cfg.darkMode}
          onToggle={v => update('darkMode', v)}
        />
      </View>

      {/* Modo offline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Modo sin conexión</Text>
        <SettingRow
          label="Guardar datos offline"
          description="Almacena el servicio activo y encola pings GPS cuando no hay internet. Se sincroniza al recuperar la conexión."
          value={cfg.offlineMode}
          onToggle={v => update('offlineMode', v)}
        />
        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={() => {
            Alert.alert(
              'Borrar datos guardados',
              '¿Deseas eliminar los datos almacenados offline (servicios en caché y pings pendientes)?',
              [
                {text: 'Cancelar', style: 'cancel'},
                {text: 'Borrar', style: 'destructive', onPress: async () => {
                  await AsyncStorage.multiRemove([
                    'clsp_offline_service',
                    'clsp_ping_queue',
                  ]);
                  Alert.alert('Listo', 'Datos offline eliminados.');
                }},
              ],
            );
          }}>
          <Text style={styles.dangerBtnText}>Borrar caché offline</Text>
        </TouchableOpacity>
      </View>

      {/* Cuenta */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cuenta</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Usuario</Text>
          <Text style={styles.infoValue}>{user?.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Rol</Text>
          <Text style={styles.infoValue}>Motorizado</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Versión</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
      </View>

      {saved && (
        <View style={styles.savedBadge}>
          <Text style={styles.savedText}>✓ Guardado</Text>
        </View>
      )}

    </ScrollView>
  );
}

function SettingRow({label, description, value, onToggle}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description ? <Text style={styles.settingDesc}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{false: '#DDD', true: '#534AB7'}}
        thumbColor={value ? '#fff' : '#f4f3f4'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F6FA'},
  content:   {padding: 20, gap: 20, paddingBottom: 40},

  pageTitle: {fontSize: 22, fontWeight: '700', color: '#222', marginBottom: 4},

  section: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    gap: 2,
  },
  sectionTitle: {fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase',
                 letterSpacing: 0.8, marginBottom: 8},

  settingRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5'},
  settingText:  {flex: 1, paddingRight: 12},
  settingLabel: {fontSize: 14, fontWeight: '500', color: '#333'},
  settingDesc:  {fontSize: 12, color: '#AAA', marginTop: 2},

  linkRow:  {paddingVertical: 12},
  linkText: {color: '#534AB7', fontSize: 13, fontWeight: '500'},

  dangerBtn:     {marginTop: 12, backgroundColor: '#FEE', borderRadius: 10, padding: 12, alignItems: 'center'},
  dangerBtnText: {color: '#D85A30', fontWeight: '600', fontSize: 13},

  infoRow:   {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
              borderBottomWidth: 1, borderBottomColor: '#F5F5F5'},
  infoLabel: {fontSize: 13, color: '#888'},
  infoValue: {fontSize: 13, color: '#333', fontWeight: '500'},

  savedBadge: {backgroundColor: '#1D9E75', borderRadius: 20, padding: 10, alignItems: 'center'},
  savedText:  {color: '#fff', fontWeight: '600'},
});

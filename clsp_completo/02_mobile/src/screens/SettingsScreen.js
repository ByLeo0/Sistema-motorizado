import React, {useEffect, useState} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch,
  TouchableOpacity, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuthStore} from '../store';
import {useTheme} from '../context/ThemeContext';

const SETTINGS_KEY = 'clsp_settings';
const defaults = {notificationsEnabled: true, soundAlerts: true};

export default function SettingsScreen() {
  const user               = useAuthStore(s => s.user);
  const {colors, isDark, toggleTheme} = useTheme();
  const [cfg,  setCfg]     = useState(defaults);
  const [saved, setSaved]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) setCfg({...defaults, ...JSON.parse(raw)});
    });
  }, []);

  const update = async (key, value) => {
    const next = {...cfg, [key]: value};
    setCfg(next);
    const raw   = await AsyncStorage.getItem(SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({...saved, [key]: value}));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const c = colors;

  return (
    <ScrollView style={[s.container, {backgroundColor: c.bg}]} contentContainerStyle={s.content}>

      <Text style={[s.pageTitle, {color: c.text}]}>Configuración</Text>

      {/* Notificaciones */}
      <View style={[s.section, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <Text style={[s.sectionTitle, {color: c.hint}]}>Notificaciones</Text>
        <SettingRow
          label="Activar notificaciones"
          description="Alertas de nuevos servicios y cambios de estado"
          value={cfg.notificationsEnabled}
          onToggle={v => update('notificationsEnabled', v)}
          colors={c}
        />
        <SettingRow
          label="Alertas de sonido"
          description="Sonido al recibir alertas de desvío de ruta"
          value={cfg.soundAlerts}
          onToggle={v => update('soundAlerts', v)}
          colors={c}
        />
        <TouchableOpacity style={s.linkRow} onPress={() => Linking.openSettings()}>
          <Text style={[s.linkText, {color: c.primary}]}>Gestionar permisos del sistema →</Text>
        </TouchableOpacity>
      </View>

      {/* Apariencia */}
      <View style={[s.section, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <Text style={[s.sectionTitle, {color: c.hint}]}>Apariencia</Text>
        <SettingRow
          label="Modo oscuro"
          description="Usa un tema oscuro en toda la aplicación"
          value={isDark}
          onToggle={v => toggleTheme(v)}
          colors={c}
        />
      </View>

      {/* Modo offline */}
      <View style={[s.section, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <Text style={[s.sectionTitle, {color: c.hint}]}>Modo sin conexión</Text>
        <Text style={[s.desc, {color: c.subtext}]}>
          Los pings GPS se encolan automáticamente cuando no hay internet y se sincronizan al recuperar la conexión.
        </Text>
        <TouchableOpacity
          style={[s.dangerBtn, {backgroundColor: c.dangerBg}]}
          onPress={() => Alert.alert(
            'Borrar datos guardados',
            '¿Eliminar pings GPS en cola y caché de servicios?',
            [
              {text: 'Cancelar', style: 'cancel'},
              {text: 'Borrar', style: 'destructive', onPress: async () => {
                await AsyncStorage.multiRemove(['clsp_offline_service', 'clsp_ping_queue']);
                Alert.alert('Listo', 'Datos offline eliminados.');
              }},
            ],
          )}>
          <Text style={[s.dangerBtnText, {color: c.danger}]}>Borrar caché offline</Text>
        </TouchableOpacity>
      </View>

      {/* Cuenta */}
      <View style={[s.section, {backgroundColor: c.card, borderColor: c.cardBorder}]}>
        <Text style={[s.sectionTitle, {color: c.hint}]}>Cuenta</Text>
        <InfoRow label="Usuario" value={user?.email}   colors={c} />
        <InfoRow label="Rol"     value="Motorizado"    colors={c} />
        <InfoRow label="Versión" value="1.0.0"         colors={c} />
      </View>

      {saved && (
        <View style={[s.savedBadge, {backgroundColor: c.success}]}>
          <Text style={s.savedText}>✓ Guardado</Text>
        </View>
      )}
    </ScrollView>
  );
}

function SettingRow({label, description, value, onToggle, colors: c}) {
  return (
    <View style={[s.settingRow, {borderBottomColor: c.separator}]}>
      <View style={s.settingText}>
        <Text style={[s.settingLabel, {color: c.text}]}>{label}</Text>
        {description ? <Text style={[s.settingDesc, {color: c.hint}]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{false: c.switchOff, true: c.primary}}
        thumbColor="#fff"
      />
    </View>
  );
}

function InfoRow({label, value, colors: c}) {
  return (
    <View style={[s.infoRow, {borderBottomColor: c.separator}]}>
      <Text style={[s.infoLabel, {color: c.hint}]}>{label}</Text>
      <Text style={[s.infoValue, {color: c.text}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {flex: 1},
  content:   {padding: 20, gap: 16, paddingBottom: 40},
  pageTitle: {fontSize: 22, fontWeight: '700', marginBottom: 4},
  section:   {borderRadius: 14, padding: 16, borderWidth: 1, gap: 2},
  sectionTitle: {fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8},
  desc: {fontSize: 13, lineHeight: 19, marginBottom: 12},
  settingRow:  {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1},
  settingText: {flex: 1, paddingRight: 12},
  settingLabel:{fontSize: 14, fontWeight: '500'},
  settingDesc: {fontSize: 12, marginTop: 2},
  linkRow:     {paddingVertical: 12},
  linkText:    {fontSize: 13, fontWeight: '500'},
  dangerBtn:   {marginTop: 4, borderRadius: 10, padding: 12, alignItems: 'center'},
  dangerBtnText:{fontWeight: '600', fontSize: 13},
  infoRow:     {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1},
  infoLabel:   {fontSize: 13},
  infoValue:   {fontSize: 13, fontWeight: '500'},
  savedBadge:  {borderRadius: 20, padding: 10, alignItems: 'center'},
  savedText:   {color: '#fff', fontWeight: '600'},
});

import React, {useState, useCallback} from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {serviceAPI} from '../services/api';
import {useServiceStore} from '../store';
import {useTheme} from '../context/ThemeContext';

export default function ServicesListScreen({navigation}) {
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const {services, setServices, setActiveService} = useServiceStore();
  const {colors: c} = useTheme();

  const fetchServices = useCallback(async () => {
    try {
      const {data} = await serviceAPI.list({ordering: '-created_at'});
      setServices(data.results || data);
    } catch (err) {
      console.error('[Services]', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchServices(); }, [fetchServices]));

  const openService = service => {
    setActiveService(service);
    navigation.navigate('ServiceDetail', {serviceId: service.id});
  };

  if (loading) {
    return (
      <View style={[s.center, {backgroundColor: c.bg}]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={{backgroundColor: c.bg}}
      data={services}
      keyExtractor={item => item.id}
      contentContainerStyle={s.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchServices(); }}
          colors={[c.primary]}
          tintColor={c.primary}
        />
      }
      ListEmptyComponent={
        <View style={s.center}>
          <Text style={{color: c.hint, fontSize: 15}}>No tienes servicios asignados.</Text>
        </View>
      }
      renderItem={({item}) => {
        const badge = c[`badge${_badgeKey(item.status)}`] || {bg: c.primaryBg, text: c.primary};
        return (
          <TouchableOpacity
            style={[s.card, {backgroundColor: c.card, borderColor: c.cardBorder}]}
            onPress={() => openService(item)}>

            <View style={s.cardHeader}>
              <Text style={[s.cardId, {color: c.subtext}]}>
                #{item.number ? String(item.number).padStart(4, '0') : item.id.slice(-6).toUpperCase()}
              </Text>
              <View style={[s.badge, {backgroundColor: badge.bg}]}>
                <Text style={[s.badgeText, {color: badge.text}]}>{STATUS_LABEL[item.status] || item.status}</Text>
              </View>
            </View>

            <View style={s.route}>
              <View style={[s.routeDot, {backgroundColor: c.primary}]} />
              <Text style={[s.routeText, {color: c.subtext}]} numberOfLines={1}>
                {item.origin_lat?.toFixed(4)}, {item.origin_lng?.toFixed(4)}
              </Text>
            </View>
            <View style={[s.routeLine, {backgroundColor: c.separator}]} />
            <View style={s.route}>
              <View style={[s.routeDot, {backgroundColor: c.danger}]} />
              <Text style={[s.routeText, {color: c.subtext}]} numberOfLines={1}>
                {item.destination_lat?.toFixed(4)}, {item.destination_lng?.toFixed(4)}
              </Text>
            </View>

            {item.notes ? (
              <Text style={[s.notes, {color: c.hint}]} numberOfLines={2}>{item.notes}</Text>
            ) : null}

            <Text style={[s.dateText, {color: c.hint}]}>
              {new Date(item.created_at).toLocaleDateString('es-PE', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const STATUS_LABEL = {
  approved:   'Aprobado',
  in_transit: 'En tránsito',
  completed:  'Completado',
  pending:    'Pendiente',
  cancelled:  'Cancelado',
  rejected:   'Rechazado',
};

function _badgeKey(status) {
  const map = {
    approved: 'Approved', in_transit: 'Transit', completed: 'Done',
    pending: 'Pending', cancelled: 'Cancelled', rejected: 'Rejected',
  };
  return map[status] || 'Approved';
}

const s = StyleSheet.create({
  list:       {padding: 16, gap: 12},
  center:     {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, minHeight: 200},
  card:       {borderRadius: 14, padding: 16, borderWidth: 1,
               shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  cardId:     {fontSize: 13, fontWeight: '600', flex: 1},
  badge:      {borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4},
  badgeText:  {fontSize: 12, fontWeight: '600'},
  route:      {flexDirection: 'row', alignItems: 'center', gap: 8},
  routeDot:   {width: 10, height: 10, borderRadius: 5},
  routeLine:  {width: 2, height: 14, marginLeft: 4, marginVertical: 2},
  routeText:  {fontSize: 13, flex: 1},
  notes:      {fontSize: 13, marginTop: 10, fontStyle: 'italic'},
  dateText:   {fontSize: 11, marginTop: 8, textAlign: 'right'},
});

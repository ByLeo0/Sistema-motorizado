import React, {useState, useCallback} from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {serviceAPI} from '../services/api';
import {useServiceStore} from '../store';

const STATUS_CONFIG = {
  approved:   {label: 'Aprobado',      color: '#534AB7', bg: '#EEEDFE'},
  in_transit: {label: 'En tránsito',   color: '#0F6E56', bg: '#E1F5EE'},
  completed:  {label: 'Completado',    color: '#3B6D11', bg: '#EAF3DE'},
  pending:    {label: 'Pendiente',     color: '#854F0B', bg: '#FAEEDA'},
  cancelled:  {label: 'Cancelado',     color: '#5F5E5A', bg: '#F1EFE8'},
};

export default function ServicesListScreen({navigation}) {
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const {services, setServices, setActiveService} = useServiceStore();

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

  // Recargar cada vez que la pantalla toma foco
  useFocusEffect(useCallback(() => { fetchServices(); }, [fetchServices]));

  const openService = service => {
    setActiveService(service);
    navigation.navigate('ServiceDetail', {serviceId: service.id});
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#534AB7" />
      </View>
    );
  }

  return (
    <FlatList
      data={services}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchServices(); }}
          colors={['#534AB7']}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No tienes servicios asignados.</Text>
        </View>
      }
      renderItem={({item}) => {
        const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
        return (
          <TouchableOpacity style={styles.card} onPress={() => openService(item)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardId} numberOfLines={1}>
                #{item.id.slice(-8).toUpperCase()}
              </Text>
              <View style={[styles.badge, {backgroundColor: cfg.bg}]}>
                <Text style={[styles.badgeText, {color: cfg.color}]}>{cfg.label}</Text>
              </View>
            </View>

            <View style={styles.route}>
              <View style={styles.routeDot} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.origin_lat?.toFixed(4)}, {item.origin_lng?.toFixed(4)}
              </Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.route}>
              <View style={[styles.routeDot, {backgroundColor: '#D85A30'}]} />
              <Text style={styles.routeText} numberOfLines={1}>
                {item.destination_lat?.toFixed(4)}, {item.destination_lng?.toFixed(4)}
              </Text>
            </View>

            {item.notes ? (
              <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
            ) : null}

            <Text style={styles.dateText}>
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

const styles = StyleSheet.create({
  list:        {padding: 16, gap: 12},
  center:      {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32},
  emptyText:   {color: '#888', fontSize: 15},
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader:  {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  cardId:      {fontSize: 13, fontWeight: '600', color: '#444', flex: 1},
  badge:       {borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4},
  badgeText:   {fontSize: 12, fontWeight: '600'},
  route:       {flexDirection: 'row', alignItems: 'center', gap: 8},
  routeDot:    {width: 10, height: 10, borderRadius: 5, backgroundColor: '#534AB7'},
  routeLine:   {width: 2, height: 14, backgroundColor: '#DDD', marginLeft: 4, marginVertical: 2},
  routeText:   {fontSize: 13, color: '#555', flex: 1},
  notes:       {fontSize: 13, color: '#777', marginTop: 10, fontStyle: 'italic'},
  dateText:    {fontSize: 11, color: '#AAA', marginTop: 8, textAlign: 'right'},
});

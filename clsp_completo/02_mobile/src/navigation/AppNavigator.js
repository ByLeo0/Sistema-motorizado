import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator}  from '@react-navigation/native-stack';
import {createBottomTabNavigator}    from '@react-navigation/bottom-tabs';
import {View, Text, StyleSheet, Animated}      from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {useAuthStore, useTrackingStore} from '../store';
import {useTheme} from '../context/ThemeContext';

import LoginScreen         from '../screens/LoginScreen';
import ServicesListScreen  from '../screens/ServicesListScreen';
import ServiceDetailScreen from '../screens/ServiceDetailScreen';
import IncidentsScreen     from '../screens/IncidentsScreen';
import ProfileScreen       from '../screens/ProfileScreen';
import SettingsScreen      from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({label, active, alert}) {
  return (
    <View style={tabStyles.iconWrap}>
      <Text style={[tabStyles.iconLabel, active && tabStyles.iconActive]}>{label}</Text>
      {alert ? <View style={tabStyles.dot} /> : null}
    </View>
  );
}

function MotoTabs() {
  const isTracking = useTrackingStore(s => s.isTracking);
  const {colors}   = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopColor:  colors.tabBorder,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.hint,
      }}>

      <Tab.Screen
        name="ServicesList"
        component={ServicesListScreen}
        options={{
          title: 'Servicios',
          tabBarIcon: ({focused}) => <TabIcon label="📋" active={focused} alert={isTracking} />,
        }}
      />
      <Tab.Screen
        name="Incidents"
        component={IncidentsScreen}
        options={{
          title: 'Incidencias',
          tabBarIcon: ({focused}) => <TabIcon label="⚠" active={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({focused}) => <TabIcon label="👤" active={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Ajustes',
          tabBarIcon: ({focused}) => <TabIcon label="⚙" active={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AuthenticatedStack() {
  const {colors} = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:      {backgroundColor: colors.headerBg},
        headerTintColor:  colors.headerText,
        headerTitleStyle: {fontWeight: '600'},
      }}>
      <Stack.Screen name="Tabs" component={MotoTabs} options={{headerShown: false}} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} options={{title: 'Detalle del servicio'}} />
    </Stack.Navigator>
  );
}

function OfflineBanner({colors}) {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable);
      setIsOnline(prev => {
        if (!prev && online) setWasOffline(true);
        return online;
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isOnline ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    if (wasOffline && isOnline) {
      setTimeout(() => setWasOffline(false), 2000);
    }
  }, [isOnline]);

  if (isOnline && !wasOffline) return null;

  return (
    <Animated.View style={[styles.banner, {opacity, backgroundColor: isOnline ? '#1D9E75' : '#D85A30'}]}>
      <Text style={styles.bannerText}>
        {isOnline ? '✓ Conexión restaurada — sincronizando...' : '⚠ Sin conexión — modo offline activo'}
      </Text>
    </Animated.View>
  );
}

export default function AppNavigator() {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  const isLoading  = useAuthStore(s => s.isLoading);
  const {colors}   = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.splash, {backgroundColor: colors.primary}]}>
        <Text style={styles.splashText}>CLSP</Text>
      </View>
    );
  }

  return (
    <View style={{flex: 1}}>
      <OfflineBanner colors={colors} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{headerShown: false}}>
          {isLoggedIn
            ? <Stack.Screen name="App"   component={AuthenticatedStack} />
            : <Stack.Screen name="Login" component={LoginScreen} />}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  splash:     {flex: 1, justifyContent: 'center', alignItems: 'center'},
  splashText: {color: '#fff', fontSize: 42, fontWeight: '700', letterSpacing: 6},
  banner:     {paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center'},
  bannerText: {color: '#fff', fontSize: 12, fontWeight: '600'},
});

const tabStyles = StyleSheet.create({
  iconWrap:   {alignItems: 'center'},
  iconLabel:  {fontSize: 20},
  iconActive: {opacity: 1},
  dot: {
    position: 'absolute', top: -2, right: -6,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#D85A30',
  },
});

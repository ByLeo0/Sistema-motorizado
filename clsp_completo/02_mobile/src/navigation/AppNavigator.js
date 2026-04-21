import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator}  from '@react-navigation/native-stack';
import {createBottomTabNavigator}    from '@react-navigation/bottom-tabs';
import {View, Text, StyleSheet}      from 'react-native';
import {useAuthStore, useTrackingStore} from '../store';

import LoginScreen        from '../screens/LoginScreen';
import ServicesListScreen from '../screens/ServicesListScreen';
import ServiceDetailScreen from '../screens/ServiceDetailScreen';
import IncidentsScreen     from '../screens/IncidentsScreen';
import ProfileScreen       from '../screens/ProfileScreen';
import SettingsScreen      from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// Ícono simple con texto
function TabIcon({label, active, alert}) {
  return (
    <View style={tabStyles.iconWrap}>
      <Text style={[tabStyles.iconLabel, active && tabStyles.iconActive]}>{label}</Text>
      {alert ? <View style={tabStyles.dot} /> : null}
    </View>
  );
}

// Tabs del motorizado autenticado
function MotoTabs() {
  const isTracking = useTrackingStore(s => s.isTracking);
  const isDeviated = useTrackingStore(s => s.isDeviated);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#EEE',
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor:   '#534AB7',
        tabBarInactiveTintColor: '#AAA',
      }}>

      <Tab.Screen
        name="ServicesList"
        component={ServicesListScreen}
        options={{
          title: 'Servicios',
          tabBarIcon: ({focused}) => (
            <TabIcon label="📋" active={focused} alert={isTracking} />
          ),
        }}
      />
      <Tab.Screen
        name="Incidents"
        component={IncidentsScreen}
        options={{
          title: 'Incidencias',
          tabBarIcon: ({focused}) => (
            <TabIcon label="⚠" active={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({focused}) => (
            <TabIcon label="👤" active={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Ajustes',
          tabBarIcon: ({focused}) => (
            <TabIcon label="⚙" active={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Stack principal (incluye pantalla de detalle sobre los tabs)
function AuthenticatedStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:     {backgroundColor: '#534AB7'},
        headerTintColor: '#fff',
        headerTitleStyle:{fontWeight: '600'},
      }}>
      <Stack.Screen
        name="Tabs"
        component={MotoTabs}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="ServiceDetail"
        component={ServiceDetailScreen}
        options={{title: 'Detalle del servicio'}}
      />
    </Stack.Navigator>
  );
}

// Raíz: decide si mostrar Login o la app según la sesión
export default function AppNavigator() {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  const isLoading  = useAuthStore(s => s.isLoading);

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashText}>CLSP</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {isLoggedIn
          ? <Stack.Screen name="App"   component={AuthenticatedStack} />
          : <Stack.Screen name="Login" component={LoginScreen} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash:     {flex: 1, backgroundColor: '#534AB7', justifyContent: 'center', alignItems: 'center'},
  splashText: {color: '#fff', fontSize: 42, fontWeight: '700', letterSpacing: 6},
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

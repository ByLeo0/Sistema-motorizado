import React, {useEffect} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import AppNavigator from './src/navigation/AppNavigator';
import {useAuthStore} from './src/store';

export default function App() {
  const hydrate = useAuthStore(s => s.hydrate);

  // Restaurar sesion guardada al abrir la app
  useEffect(() => {
    hydrate();
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <AppNavigator />
      <Toast />
    </GestureHandlerRootView>
  );
}

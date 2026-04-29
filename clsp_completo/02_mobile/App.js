import React, {useEffect} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import AppNavigator from './src/navigation/AppNavigator';
import {useAuthStore} from './src/store';
import {ThemeProvider} from './src/context/ThemeContext';

export default function App() {
  const hydrate = useAuthStore(s => s.hydrate);

  useEffect(() => { hydrate(); }, []);

  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{flex: 1}}>
        <AppNavigator />
        <Toast />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

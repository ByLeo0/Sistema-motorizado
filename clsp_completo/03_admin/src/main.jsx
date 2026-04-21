import React from 'react';
import ReactDOM from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'react-hot-toast';
import App from './App';
import './index.css';
import 'leaflet/dist/leaflet.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:              1,
      refetchOnWindowFocus: false,
      staleTime:          30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {borderRadius: '10px', fontSize: '14px'},
          success: {iconTheme: {primary: '#1D9E75', secondary: '#fff'}},
          error:   {iconTheme: {primary: '#D85A30', secondary: '#fff'}},
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);

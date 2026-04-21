/**
 * Hook para adjuntar documentos desde la camara o galeria.
 * Usa react-native-image-picker (ya compilado en el proyecto).
 */
import {useState, useCallback} from 'react';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {serviceAPI} from '../services/api';
import Toast from 'react-native-toast-message';
import {Platform, Alert} from 'react-native';

export function useDocumentScanner(serviceId) {
  const [isScanning,   setIsScanning]   = useState(false);
  const [isUploading,  setIsUploading]  = useState(false);
  const [scannedDocs,  setScannedDocs]  = useState([]);

  const _upload = useCallback(async (asset, docType) => {
    if (!asset) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri:  Platform.OS === 'android' ? asset.uri : asset.uri.replace('file://', ''),
        type: asset.type || 'image/jpeg',
        name: asset.fileName || `doc_${Date.now()}.jpg`,
      });
      formData.append('doc_type', docType);

      const {data} = await serviceAPI.uploadDocument(serviceId, formData);
      setScannedDocs(prev => [...prev, data]);
      Toast.show({
        type:  'success',
        text1: 'Documento subido',
        text2: `${_docTypeLabel(docType)} guardado correctamente.`,
      });
      return data;
    } catch (err) {
      console.error('[Scanner]', err);
      Toast.show({
        type:  'error',
        text1: 'Error al subir',
        text2: err.message || 'Intenta nuevamente.',
      });
    } finally {
      setIsUploading(false);
    }
  }, [serviceId]);

  const scanDocument = useCallback(async (docType = 'other') => {
    Alert.alert(
      'Adjuntar documento',
      '¿Cómo deseas adjuntar el documento?',
      [
        {
          text: 'Cámara',
          onPress: async () => {
            setIsScanning(true);
            const result = await launchCamera({
              mediaType: 'photo',
              quality: 0.9,
              saveToPhotos: false,
            });
            setIsScanning(false);
            if (!result.didCancel && result.assets?.[0]) {
              await _upload(result.assets[0], docType);
            }
          },
        },
        {
          text: 'Galería',
          onPress: async () => {
            const result = await launchImageLibrary({
              mediaType: 'photo',
              quality: 0.9,
            });
            if (!result.didCancel && result.assets?.[0]) {
              await _upload(result.assets[0], docType);
            }
          },
        },
        {text: 'Cancelar', style: 'cancel'},
      ],
    );
  }, [_upload]);

  const removeLocal = useCallback(id => {
    setScannedDocs(prev => prev.filter(d => d.id !== id));
  }, []);

  return {
    scanDocument,
    isScanning,
    isUploading,
    scannedDocs,
    removeLocal,
  };
}

function _docTypeLabel(type) {
  const labels = {
    delivery_note: 'Guia de remision',
    invoice:       'Factura',
    receipt:       'Recibo de conformidad',
    other:         'Documento',
  };
  return labels[type] || 'Documento';
}

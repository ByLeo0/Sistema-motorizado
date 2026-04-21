from .base import *

DEBUG = True

# En local guardamos archivos en /media en vez de S3
DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : '');

// Upload a file in 5MB chunks
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB to be safe for slow internet and timeouts

export const uploadFileInChunks = async (file, onProgress) => {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  let uploadResult = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('originalname', file.name);
    formData.append('chunkIndex', chunkIndex);
    formData.append('totalChunks', totalChunks);
    formData.append('uploadId', uploadId);

    let chunkSuccess = false;
    let attempts = 0;
    let response;

    while (!chunkSuccess && attempts < 3) {
      try {
        attempts++;
        response = await axios.post(`${API_URL}/api/upload/chunk`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          onUploadProgress: (progressEvent) => {
            // Calculate total progress including previous chunks
            const chunkProgress = progressEvent.loaded;
            const totalProgress = start + chunkProgress;
            const percentage = Math.round((totalProgress * 100) / file.size);
            if (onProgress) onProgress(percentage);
          }
        });
        chunkSuccess = true;
      } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          window.dispatchEvent(new Event('unauthorized'));
          throw new Error('Session expired');
        }
        if (attempts >= 3) {
          throw error;
        }
        const delay = Math.pow(2, attempts - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay)); // Exponential backoff
      }
    }

    if (response && response.data.completed) {
      uploadResult = response.data;
    }
  }

  return uploadResult;
};

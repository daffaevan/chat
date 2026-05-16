import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const api = axios.create({
  baseURL: BACKEND_URL,
});

// Add a request interceptor to include the token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pink_chat_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const getFullUrl = (path: string | null | undefined) => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
};

export default api;

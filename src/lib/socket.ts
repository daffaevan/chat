import { io } from "socket.io-client";

// Ganti URL ini dengan URL Publik STB kamu (misal dari Cloudflare Tunnel)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling']
});

export default socket;

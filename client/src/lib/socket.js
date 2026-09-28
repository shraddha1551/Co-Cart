/** socket.io-client factory: websocket only (no sticky sessions needed), token handshake (NFR-REL-03). */
import { io } from 'socket.io-client';
import { API_URL } from './api';

export const createSocket = (sessionToken, memberToken) => io(API_URL, {
  transports: ['websocket'],
  auth: { sessionToken, memberToken },
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
});

'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

interface WSContextValue {
  socket: Socket | null;
  connected: boolean;
  subscribeTicker: (ticker: string) => void;
  unsubscribeTicker: (ticker: string) => void;
}

const WSContext = createContext<WSContextValue>({
  socket: null,
  connected: false,
  subscribeTicker: () => {},
  unsubscribeTicker: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const { accessToken, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('WS connect error:', err.message);
    });

    // Global signal handler → toast notification
    socket.on('signal:new', (signal) => {
      const icon = signal.severity === 'CRITICAL' ? '🚨' :
                   signal.severity === 'HIGH' ? '⚡' : '📡';
      toast(
        `${icon} ${signal.title}`,
        {
          duration: 6000,
          style: {
            background: signal.severity === 'CRITICAL' ? '#1a0a0a' :
                       signal.severity === 'HIGH' ? '#1a1200' : '#0d1117',
            borderLeft: `3px solid ${
              signal.severity === 'CRITICAL' ? '#ff3b3b' :
              signal.severity === 'HIGH' ? '#ffb800' : '#00a8ff'
            }`,
          },
        }
      );
    });

    // Alert notification
    socket.on('alert:fired', (alert) => {
      toast.success(`Alert: ${alert.message}`, { duration: 8000 });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, accessToken]);

  const subscribeTicker = (ticker: string) => {
    socketRef.current?.emit('subscribe:ticker', ticker);
  };

  const unsubscribeTicker = (ticker: string) => {
    socketRef.current?.emit('unsubscribe:ticker', ticker);
  };

  return (
    <WSContext.Provider value={{
      socket: socketRef.current,
      connected,
      subscribeTicker,
      unsubscribeTicker,
    }}>
      {children}
    </WSContext.Provider>
  );
}

export const useWebSocket = () => useContext(WSContext);

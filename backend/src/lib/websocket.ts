import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';

export let io: SocketServer;

export interface ServerToClientEvents {
  'signal:new': (signal: any) => void;
  'sentiment:update': (data: any) => void;
  'earnings:update': (data: any) => void;
  'alert:fired': (alert: any) => void;
  'price:update': (data: any) => void;
  'ticker:subscribed': (ticker: string) => void;
  'error': (err: { message: string }) => void;
}

export function initializeWebSocket(server: HttpServer): void {
  io = new SocketServer<Record<string, never>, ServerToClientEvents>(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Auth middleware
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(token);
      (socket as any).userId = payload.sub;
      (socket as any).userTier = payload.tier;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    logger.info('WS client connected', { userId, socketId: socket.id });

    // Join user-specific room for personal alerts
    socket.join(`user:${userId}`);

    // Subscribe to specific ticker updates
    socket.on('subscribe:ticker', (ticker: string) => {
      if (typeof ticker !== 'string' || ticker.length > 10) return;
      const room = `ticker:${ticker.toUpperCase()}`;
      socket.join(room);
      socket.emit('ticker:subscribed', ticker.toUpperCase());
      logger.debug('WS ticker subscribed', { userId, ticker });
    });

    socket.on('unsubscribe:ticker', (ticker: string) => {
      socket.leave(`ticker:${ticker.toUpperCase()}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info('WS client disconnected', { userId, reason });
    });
  });

  logger.info('WebSocket server initialized');
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

export function broadcastSignal(ticker: string, signal: any): void {
  if (!io) return;
  io.to(`ticker:${ticker.toUpperCase()}`).emit('signal:new', signal);
  io.to('signals:global').emit('signal:new', signal);
}

export function broadcastSentimentUpdate(ticker: string, data: any): void {
  if (!io) return;
  io.to(`ticker:${ticker.toUpperCase()}`).emit('sentiment:update', data);
}

export function broadcastEarningsUpdate(ticker: string, data: any): void {
  if (!io) return;
  io.to(`ticker:${ticker.toUpperCase()}`).emit('earnings:update', data);
  io.to('earnings:global').emit('earnings:update', data);
}

export function broadcastAlertToUser(userId: string, alert: any): void {
  if (!io) return;
  io.to(`user:${userId}`).emit('alert:fired', alert);
}

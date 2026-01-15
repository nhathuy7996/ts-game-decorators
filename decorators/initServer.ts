import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { registerRoutes } from './autoRouter';
import { registerSocketServices } from './socketDecorators';

export interface InitOptions {
    port: number;
    apiControllers?: any[];
    socketServices?: any[];
    authAPIMiddleware?: any;
    authSocketMiddleware?: (socket: any, next: (err?: Error) => void) => void; // Optional socket auth middleware
    onReady?: (app: Express, io: SocketIOServer, httpServer: HTTPServer) => void;
    publicPath?: string;
    expressConfig?: (app: Express) => void;
    socketConfig?: (io: SocketIOServer) => void;
    createRedisAdapter?: () => Promise<any>; // Optional async function to create redis adapter
}

export async function initServer(options: InitOptions) {
    const app = express();
    const httpServer = createServer(app);
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling'],
        allowUpgrades: true,
        connectTimeout: 45000,
        pingTimeout: 60000,
        pingInterval: 25000,
        cookie: {
            name: 'io',
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000
        },
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: true,
        }
    });

    // Redis adapter support
    if (options.createRedisAdapter) {
        try {
            const redisAdapter = await options.createRedisAdapter();
            if (redisAdapter) {
                io.adapter(redisAdapter);
                console.log('✅ Socket.IO Redis adapter configured');
            }
        } catch (err) {
            console.warn('⚠️ Redis adapter failed to initialize, using default adapter:', err);
        }
    }

    // Socket auth middleware (optional)
    if (options.authSocketMiddleware) {
        io.use(options.authSocketMiddleware);
        console.log('🔐 Socket auth middleware configured');
    }

    // Express config
    app.use(express.json());
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Credentials', 'true');
        next();
    });
    if (options.publicPath) {
        app.use(express.static(options.publicPath));
    }
    if (options.expressConfig) {
        options.expressConfig(app);
    }

    // Register API controllers
    if (options.apiControllers && options.apiControllers.length > 0) {
        registerRoutes(app, options.authAPIMiddleware, ...options.apiControllers);
    }

    // Register socket services
    if (options.socketServices && options.socketServices.length > 0) {
        registerSocketServices(io, options.socketServices, options.authSocketMiddleware);
    }
    if (options.socketConfig) {
        options.socketConfig(io);
    }

    // Error handling
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('Error:', err);
        res.status(500).json({ error: 'Something went wrong!', details: err.message });
    });

    httpServer.listen(options.port, () => {
        console.log(`Server is running on http://localhost:${options.port}`);
        if (options.onReady) options.onReady(app, io, httpServer);
    });

    return { app, io, httpServer };
}

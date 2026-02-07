import { Request, Response, NextFunction } from 'express';
import { utils } from '../utils/utils';
import { Socket } from 'socket.io';
import { AuthenticatedRequest, AuthenticatedSocket } from '../types';

export const authAPIToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip authentication for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
        console.log('🔄 Skipping auth for OPTIONS request (CORS preflight)');
        return next();
    }

    console.log('🔍 Request method:', req.method);
    console.log('🔍 Request URL:', req.url);

    const auth = req.headers.authorization; // "Bearer <token>" 
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

    console.log('🔑 API authentication token:', token);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }

    try {
        const decoded = utils.tokenDecode(token);
        req.userId = decoded.userId;
        console.log('✅ API authenticated successfully for userId:', decoded.userId);
        next();
    } catch (error) {
        console.error(error);
        return res.status(403).json({
            success: false,
            message: error
        });
    }
};

export const authSocketToken = (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    console.log('🔐 Socket authentication middleware triggered for socket:', socket.id);

    try {
        var token = socket.handshake.auth.token; 
         
        console.log(`🔑 Socket authentication token: ${token ? 'Present' : 'Missing'}`);
        // Temporarily allow connections without token for debugging
        if (!token) {
            
            console.log('⚠️ No token provided, but allowing connection for debugging');
            
            token = socket.handshake.query.token;
        }

        const decoded = utils.tokenDecode(token);
        console.log(decoded);
        socket.userId = decoded.userId; 
        next();
    } catch (error) {
        console.error('❌ Socket authentication error!');
    }
};
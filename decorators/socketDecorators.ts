import 'reflect-metadata';
import { Server, Socket } from 'socket.io';

const SOCKET_SERVICE_META = Symbol('socket_service');
const SOCKET_EVENTS_META = Symbol('socket_events');
const SOCKET_AUTHEN_META = Symbol('socket_authen');
// Decorator cho xác thực socket
export function AuthenSocket(): MethodDecorator & ClassDecorator {
    return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
        if (propertyKey) {
            // Method
            const authenMethods = Reflect.getMetadata(SOCKET_AUTHEN_META, target.constructor) || [];
            authenMethods.push(propertyKey);
            Reflect.defineMetadata(SOCKET_AUTHEN_META, authenMethods, target.constructor);
        } else {
            // Class
            Reflect.defineMetadata(SOCKET_AUTHEN_META, true, target);
        }
    };
}

export function SocketService(): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(SOCKET_SERVICE_META, true, target);
    };
}

export function OnEvent(event: string): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const events = Reflect.getMetadata(SOCKET_EVENTS_META, target.constructor) || [];
        events.push({ type: 'event', event, handler: propertyKey });
        Reflect.defineMetadata(SOCKET_EVENTS_META, events, target.constructor);
    };
}

export function OnConnect(): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const events = Reflect.getMetadata(SOCKET_EVENTS_META, target.constructor) || [];
        events.push({ type: 'connect', handler: propertyKey });
        Reflect.defineMetadata(SOCKET_EVENTS_META, events, target.constructor);
    };
}

export function OnDisconnect(): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const events = Reflect.getMetadata(SOCKET_EVENTS_META, target.constructor) || [];
        events.push({ type: 'disconnect', handler: propertyKey });
        Reflect.defineMetadata(SOCKET_EVENTS_META, events, target.constructor);
    };
}

export function OnError(): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const events = Reflect.getMetadata(SOCKET_EVENTS_META, target.constructor) || [];
        events.push({ type: 'error', handler: propertyKey });
        Reflect.defineMetadata(SOCKET_EVENTS_META, events, target.constructor);
    };
}

export function registerSocketServices(io: Server, serviceClasses: any[], authSocketMiddleware?: (socket: any, next: (err?: Error) => void) => void) {
    // Import internal middleware as fallback
    const { authSocketToken } = require('../middleware/auth');
    
    // Create singleton instances ONCE for all connections
    const serviceInstances = serviceClasses.map(ServiceClass => {
        if (!Reflect.getMetadata(SOCKET_SERVICE_META, ServiceClass)) return null;
        // Nếu class nhận io ở constructor thì truyền vào
        try {
            return new ServiceClass(io);
        } catch {
            return new ServiceClass();
        }
    }).filter(Boolean); // Remove null values
    
    io.on('connection', (socket: Socket) => {
        serviceInstances.forEach((instance: any) => {
            const ServiceClass = instance.constructor;
            const events = Reflect.getMetadata(SOCKET_EVENTS_META, ServiceClass) || [];
            const classAuthen = Reflect.getMetadata(SOCKET_AUTHEN_META, ServiceClass);
            const methodAuthenArr = Reflect.getMetadata(SOCKET_AUTHEN_META, ServiceClass) || [];
            events.forEach((evt: any) => {
                const methodAuthen = Array.isArray(methodAuthenArr) && methodAuthenArr.includes(evt.handler);
                const needAuth = classAuthen || methodAuthen;
                const handler = (...args: any[]) => {
                    Promise.resolve(instance[evt.handler](socket, ...args)).catch(console.error);
                };
                if (evt.type === 'event') {
                    socket.on(evt.event, (...args: any[]) => {
                        if (needAuth) {
                            const authFn = authSocketMiddleware || authSocketToken;
                            authFn(socket, (err?: Error) => {
                                if (err) return socket.emit('server:error', err.message);
                                handler(...args);
                            });
                        } else {
                            handler(...args);
                        }
                    });
                } else if (evt.type === 'connect') {
                    // Gọi ngay khi client connect vào, nhưng chạy auth trước nếu cần
                    if (needAuth) {
                        const authFn = authSocketMiddleware || authSocketToken;
                        authFn(socket, (err?: Error) => {
                            if (err) return socket.emit('server:error', err.message);
                            Promise.resolve(instance[evt.handler](socket)).catch(console.error);
                        });
                    } else {
                        Promise.resolve(instance[evt.handler](socket)).catch(console.error);
                    }
                } else if (evt.type === 'disconnect') {
                    socket.on('disconnect', (...args: any[]) => handler(...args));
                } else if (evt.type === 'error') {
                    socket.on('error', (...args: any[]) => handler(...args));
                }
            });
        });
    });
}

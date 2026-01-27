import 'reflect-metadata';
declare const Reflect: any;
import { Express, Request, Response, NextFunction, Router } from 'express';
import { BusinessException } from '../exceptions/businessException';

const ROUTER_META = Symbol('router');
const ROUTES_META = Symbol('routes');
const AUTHEN_META = Symbol('authen');

export function RouterController(basePath: string = ''): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(ROUTER_META, basePath, target);
    };
}

export function Get(path: string): MethodDecorator {
    return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor | void => {
        const routes = Reflect.getMetadata(ROUTES_META, (target as any).constructor) || [];
        routes.push({ method: 'get', path, handler: propertyKey });
        Reflect.defineMetadata(ROUTES_META, routes, (target as any).constructor);
        return descriptor;
    };
}

export function Post(path: string): MethodDecorator {
    return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor | void => {
        const routes = Reflect.getMetadata(ROUTES_META, (target as any).constructor) || [];
        routes.push({ method: 'post', path, handler: propertyKey });
        Reflect.defineMetadata(ROUTES_META, routes, (target as any).constructor);
        return descriptor;
    };
}

export function Authen(): MethodDecorator & ClassDecorator {
    return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
        if (propertyKey) {
            // Method
            let authenMethods = Reflect.getMetadata(AUTHEN_META, target.constructor);
            if (!Array.isArray(authenMethods)) authenMethods = [];
            authenMethods.push(propertyKey);
            Reflect.defineMetadata(AUTHEN_META, authenMethods, target.constructor);
        } else {
            // Class
            Reflect.defineMetadata(AUTHEN_META, true, target);
        }
    };
}

export function registerRoutes(app: Express, authMiddleware: any, ...controllers: any[]) {
    controllers.forEach(Controller => {
        const basePath = Reflect.getMetadata(ROUTER_META, Controller) || '';
        const routes = Reflect.getMetadata(ROUTES_META, Controller) || [];
        const authMeta = Reflect.getMetadata(AUTHEN_META, Controller);
        const classAuthen = authMeta === true;
        const methodAuthenArr = Array.isArray(authMeta) ? authMeta : [];
        const instance = new Controller();
        const router = Router();
        routes.forEach((route: any) => {
            const handler = async (req: Request, res: Response, next: NextFunction) => {
                try {
                    await instance[route.handler](req, res, next);
                } catch (error) {
                    // Handle BusinessException automatically
                    if (error instanceof BusinessException) {
                        const responsePayload: any = {
                            success: false,
                            message: error.message
                        };
                        
                        if (error.code !== undefined) {
                            responsePayload.code = error.code;
                        }
                        
                        return res.status(error.statusCode).json(responsePayload);
                    }
                    // Pass other errors to Express error handler
                    next(error);
                }
            };
            const methodAuthen = methodAuthenArr.includes(route.handler);
            const routeMethod = route.method as 'get' | 'post' | 'put' | 'delete';
            if (classAuthen || methodAuthen) {
                (router[routeMethod] as Function)(route.path, authMiddleware, handler);
            } else {
                (router[routeMethod] as Function)(route.path, handler);
            }
        });
        app.use(basePath, router);
    });
}

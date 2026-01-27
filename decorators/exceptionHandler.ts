import { Request, Response, NextFunction } from 'express';
import { BusinessException } from '../exceptions/businessException';

/**
 * Decorator to handle BusinessException automatically
 * Catches BusinessException and formats response as:
 * { success: false, message: string, code?: number }
 * with appropriate HTTP status code
 */
export function HandleBusinessException(): MethodDecorator {
    return (
        target: Object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor => {
        const originalMethod = descriptor.value;

        descriptor.value = async function (
            req: Request,
            res: Response,
            next: NextFunction
        ) {
            try {
                return await originalMethod.apply(this, [req, res, next]);
            } catch (error) {
                if (error instanceof BusinessException) {
                    // Handle BusinessException
                    const responsePayload: any = {
                        success: false,
                        message: error.message
                    };
                    
                    // Include code if available
                    if (error.code !== undefined) {
                        responsePayload.code = error.code;
                    }
                    
                    return res.status(error.statusCode).json(responsePayload);
                }
                
                // Re-throw non-business exceptions to be handled by Express error handler
                throw error;
            }
        };

        return descriptor;
    };
}

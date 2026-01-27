/**
 * Interface for business message exceptions
 * Similar to Java BusinessMessageInterface
 */
export interface BusinessMessageInterface {
    code: number;
    message: string;
    statusCode: number;
}

/**
 * Base Business Exception class
 * Extends Error and implements BusinessMessageInterface
 */
export class BusinessException extends Error implements BusinessMessageInterface {
    public readonly code: number;
    public readonly statusCode: number;

    constructor(businessMessage: BusinessMessageInterface) {
        super(businessMessage.message);
        this.name = 'BusinessException';
        this.code = businessMessage.code;
        this.statusCode = businessMessage.statusCode;
        
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BusinessException);
        }
    }
}

/**
 * Type for business message value definition
 */
export type BusinessMessageValue = [number, string, number]; // [code, message, statusCode]

/**
 * Factory function to create enum-like business message classes
 * Usage:
 * const ShopBusinessMessage = createBusinessMessage({
 *   INTERNAL_ERROR: [11000, "Internal server error", 500],
 *   INVALID_REQUEST: [11001, "Invalid request", 400],
 * });
 * 
 * Then throw: throw new BusinessException(ShopBusinessMessage.INTERNAL_ERROR);
 */
export function createBusinessMessage<T extends Record<string, BusinessMessageValue>>(
    definitions: T
): { [K in keyof T]: BusinessMessageInterface } {
    const result = {} as any;
    
    for (const [key, value] of Object.entries(definitions)) {
        const [code, message, statusCode] = value as BusinessMessageValue;
        result[key] = {
            code,
            message,
            statusCode
        };
    }
    
    return result;
}

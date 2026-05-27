import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { Request, Response } from 'express'
import { ApiResponse, ERROR_CODE, ERROR_MESSAGE } from '../base/api-response'
import { BusinessException } from '../base/business.exception'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    const errorCode =
      exception instanceof BusinessException
        ? exception.getErrorCode()
        : ERROR_CODE.INTERNAL_SERVER_ERROR

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : ERROR_MESSAGE[errorCode] || 'Internal server error'

    const errorMessage =
      typeof message === 'object' && message !== null && 'message' in message
        ? (message as Record<string, unknown>).message
        : message

    const responseData: ApiResponse = {
      success: false,
      statusCode: status,
      errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage),
      data: null,
    }

    response.status(status).json(responseData)
  }
}

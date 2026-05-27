import { HttpException, HttpStatus } from '@nestjs/common'
import { ErrorCode } from './api-response'

/**
 * 业务异常类
 */
export class BusinessException extends HttpException {
  private readonly errorCode: ErrorCode

  constructor(
    errorCode: ErrorCode,
    message?: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message || 'Business Error', statusCode)
    this.errorCode = errorCode
  }

  getErrorCode(): ErrorCode {
    return this.errorCode
  }
}

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../base/api-response';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const statusCode = context.switchToHttp().getResponse().statusCode;
    
    // 如果是 SSE 接口（如包含 stream 路径），不要包装，否则会破坏 SSE 的特定格式
    if (request.url.includes('/stream')) {
      return next.handle();
    }
    
    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode,
        data,
        message: 'success',
      })),
    );
  }
}

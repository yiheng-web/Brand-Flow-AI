import { applyDecorators, Type } from '@nestjs/common'
import { ApiCreatedResponse, ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger'

type ApiSuccessStatus = 'ok' | 'created'

function buildWrappedSchema(model: Type<unknown>, isArray: boolean) {
  const dataSchema = isArray
    ? {
        type: 'array',
        items: { $ref: getSchemaPath(model) },
      }
    : { $ref: getSchemaPath(model) }

  return {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        example: true,
      },
      statusCode: {
        type: 'number',
        example: 200,
      },
      data: dataSchema,
      message: {
        type: 'string',
        example: 'success',
      },
    },
  }
}

function apiWrappedResponse(
  model: Type<unknown>,
  description: string,
  isArray: boolean,
  status: ApiSuccessStatus,
) {
  const response = status === 'created' ? ApiCreatedResponse : ApiOkResponse

  return applyDecorators(
    ApiExtraModels(model),
    response({
      description,
      schema: buildWrappedSchema(model, isArray),
    }),
  )
}

export function ApiSuccessResponse(model: Type<unknown>, description = '请求成功') {
  return apiWrappedResponse(model, description, false, 'ok')
}

export function ApiSuccessArrayResponse(model: Type<unknown>, description = '请求成功') {
  return apiWrappedResponse(model, description, true, 'ok')
}

export function ApiCreatedSuccessResponse(model: Type<unknown>, description = '创建成功') {
  return apiWrappedResponse(model, description, false, 'created')
}

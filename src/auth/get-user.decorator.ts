import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface AuthUser {
  id: string;
  email: string;
}

export const GetUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    if (data) return request.user[data];
    return request.user;
  },
);

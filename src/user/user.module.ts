import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';

/**
 * 用户模块
 * 导出 UserService 供其他模块使用
 */
@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

import { Module } from '@nestjs/common';
import { UserService } from './user.service';

/**
 * 用户模块
 * 导出 UserService 供其他模块使用
 */
@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

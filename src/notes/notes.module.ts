import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { UserModule } from '../user/user.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [UserModule, MediaModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}

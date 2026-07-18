import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService.uploadFile', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: string) => {
              const map: Record<string, string> = {
                'qiniu.accessKey': 'ak',
                'qiniu.secretKey': 'sk',
                'qiniu.bucket': 'bucket',
                'qiniu.domain': 'https://cdn.example.com',
              };
              return map[key] ?? def ?? '';
            },
          },
        },
      ],
    }).compile();

    service = module.get(StorageService);
  });

  it('reads MultipartFile via toBuffer and returns url/mime/size', async () => {
    const buffer = Buffer.from('fake-png');
    jest.spyOn(service, 'uploadBuffer').mockResolvedValue({ key: 'uploads/x.png' });

    const file = {
      filename: 'avatar.png',
      mimetype: 'image/png',
      toBuffer: jest.fn().mockResolvedValue(buffer),
    };

    const result = await service.uploadFile(file as any);

    expect(file.toBuffer).toHaveBeenCalled();
    expect(service.uploadBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^uploads\/.+\.png$/),
      buffer,
    );
    expect(result).toEqual({
      key: expect.stringMatching(/^uploads\/.+\.png$/),
      url: expect.stringContaining('https://cdn.example.com/'),
      mimeType: 'image/png',
      size: buffer.length,
    });
  });
});

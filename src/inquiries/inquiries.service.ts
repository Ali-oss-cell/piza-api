import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InquiryStatus, InquiryType, Prisma } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryStatusDto } from './dto/update-inquiry-status.dto';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  async create(dto: CreateInquiryDto, brandSlug?: string) {
    const brand = await this.brandsService.resolveBrand(brandSlug);

    if (dto.type === InquiryType.CATERING && dto.payload) {
      const guestCount = Number(dto.payload.guestCount);
      if (!Number.isFinite(guestCount) || guestCount < 10) {
        throw new BadRequestException('Catering inquiries need at least 10 guests.');
      }
    }

    return this.prisma.storeInquiry.create({
      data: {
        brandId: brand.id,
        type: dto.type,
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || undefined,
        subject: dto.subject?.trim() || undefined,
        message: dto.message.trim(),
        payload: dto.payload
          ? (dto.payload as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async findAll(brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);

    return this.prisma.storeInquiry.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, dto: UpdateInquiryStatusDto, brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);

    const inquiry = await this.prisma.storeInquiry.findFirst({
      where: { id, brandId },
    });

    if (!inquiry) {
      throw new NotFoundException('Inquiry not found.');
    }

    return this.prisma.storeInquiry.update({
      where: { id },
      data: {
        status: dto.status,
        readAt:
          dto.status === InquiryStatus.READ && !inquiry.readAt
            ? new Date()
            : inquiry.readAt,
      },
    });
  }
}

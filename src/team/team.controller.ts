import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StoreAccessService } from '../common/services/store-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamService } from './team.service';

@Controller('team')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly storeAccess: StoreAccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('brand') brand?: string,
  ) {
    if (!brand) {
      throw new BadRequestException('brand query parameter is required');
    }
    await this.storeAccess.assertCanManageStore(user, brand);
    return this.teamService.listForStore(brand);
  }

  @Post('invite')
  async invite(
    @Body() dto: InviteTeamMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.storeAccess.assertCanManageStore(user, dto.brandSlug);
    return this.teamService.invite(dto, user);
  }

  @Patch(':membershipId')
  async update(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateTeamMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const membership = await this.prisma.userStore.findUnique({
      where: { id: membershipId },
      include: { store: { select: { slug: true } } },
    });
    if (membership) {
      await this.storeAccess.assertCanManageStore(user, membership.store.slug);
    }
    return this.teamService.updateMembership(membershipId, dto, user);
  }
}

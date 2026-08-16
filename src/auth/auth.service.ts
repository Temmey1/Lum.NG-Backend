import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const admin = await (this.prisma as any).admin.findFirst({ where: { username } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwt.sign({ sub: admin.id, username: admin.username, role: 'admin' });
    return { token, username: admin.username, role: 'admin' };
  }

  async updateCredentials(username: string, password: string) {
    const admin = await (this.prisma as any).admin.findFirst();
    if (!admin) throw new UnauthorizedException('No admin found');
    const passwordHash = await bcrypt.hash(password, 10);
    await (this.prisma as any).admin.update({
      where: { id: admin.id },
      data: { username, passwordHash },
    });
    return { success: true, message: 'Credentials updated' };
  }
}

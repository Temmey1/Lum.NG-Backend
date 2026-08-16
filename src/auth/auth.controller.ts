import { Controller, Post, Put, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  @Put('credentials')
  @UseGuards(JwtAuthGuard)
  updateCredentials(@Body() body: { username: string; password: string }) {
    return this.authService.updateCredentials(body.username, body.password);
  }
}

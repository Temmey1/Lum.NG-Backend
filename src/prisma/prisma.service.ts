import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const rawUrl =
      configService.get<string>('DATABASE_URL') ||
      process.env.DATABASE_URL;

    if (!rawUrl) {
      throw new Error(
        '[Prisma] DATABASE_URL is missing. Make sure your backend/.env file has:\n' +
        '  DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/lumng"\n' +
        'Then: (1) create the "lumng" database in PostgreSQL, (2) run "npm run db:migrate".'
      );
    }

    const pool = new Pool({
      connectionString: rawUrl,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });

    pool.on('error', (err) => {
      const code = (err as any)?.code;
      if (code === '28P01') {
        this.logger.error(
          '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '  ⚠ PostgreSQL: AUTH FAILED (password incorrect)\n' +
          '  The credentials in DATABASE_URL were rejected by your local PostgreSQL server.\n\n' +
          '  Fix it — set a password for user "postgres" and update backend/.env:\n' +
          '    # In psql run:\n' +
          '    ALTER USER postgres PASSWORD \'postgres\';\n' +
          '    CREATE DATABASE lumng;\n\n' +
          '  Current DATABASE_URL: ' + maskPassword(rawUrl) + '\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        );
      } else if (code === '3D000') {
        this.logger.error(
          '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '  ⚠ PostgreSQL: DATABASE "lumng" DOES NOT EXIST\n' +
          '  Create it first in psql:\n' +
          '    CREATE DATABASE lumng;\n' +
          '  Then run:  npm run db:migrate\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        );
      } else if (code === 'ECONNREFUSED') {
        this.logger.error(
          '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '  ⚠ PostgreSQL: CONNECTION REFUSED (is the server running?)\n' +
          '  Start PostgreSQL on port 5432 and ensure it allows password auth.\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        );
      } else {
        this.logger.error(`[Prisma] pg Pool error: ${err.message}`, (err as any)?.stack);
      }
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log:
        (configService.get<string>('NODE_ENV') || process.env.NODE_ENV) === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ PostgreSQL connected via Prisma');
    } catch (err: any) {
      const friendly = friendlyDbError(err, this.configService);
      this.logger.error(friendly);
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function maskPassword(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return url;
  }
}

function friendlyDbError(err: any, config: ConfigService): string {
  const url = config.get<string>('DATABASE_URL') || process.env.DATABASE_URL || '(not set)';
  const cause = err?.meta?.driverAdapterError?.cause || err?.cause || {};
  const code = cause.originalCode || err?.code;
  const msg = cause.originalMessage || err?.message || String(err);

  let hint = '';
  if (code === 'P1000' || code === '28P01' || /password authentication failed/i.test(msg)) {
    hint =
      '\n  FIX STEPS:\n' +
      '  1. Open SQL Shell (psql) and log in to your local PostgreSQL.\n' +
      '  2. Set the postgres password:  ALTER USER postgres PASSWORD \'postgres\';\n' +
      '  3. Create the database:        CREATE DATABASE lumng;\n' +
      '  4. Run migrations:             cd backend && npm run db:migrate\n' +
      '  5. Restart the backend server.\n';
  } else if (/database .* does not exist/i.test(msg) || code === '3D000') {
    hint =
      '\n  FIX STEPS:\n' +
      '  1. In psql: CREATE DATABASE lumng;\n' +
      '  2. Then run: cd backend && npm run db:migrate\n';
  } else if (/connection refused/i.test(msg) || /ENOENT|ECONNREFUSED/.test(code || '')) {
    hint =
      '\n  FIX STEPS:\n' +
      '  - Start your local PostgreSQL server (services.msc on Windows).\n' +
      '  - Verify it is listening on port 5432.\n';
  }

  return (
    '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '  ❌ DATABASE CONNECTION FAILED\n' +
    `  Code   : ${code}\n` +
    `  Detail : ${msg}\n` +
    `  DATABASE_URL : ${maskPassword(url)}\n` +
    (hint || '') +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
}

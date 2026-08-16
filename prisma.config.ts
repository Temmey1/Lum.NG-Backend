import 'dotenv/config';
import { PrismaConfig } from 'prisma/config';

export default {
  datasource: {
    url: process.env.DATABASE_URL,
  },
} satisfies PrismaConfig;

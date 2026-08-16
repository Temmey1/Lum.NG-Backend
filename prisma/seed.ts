import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PRODUCTS = [
  { name:'Royal Ankara', category:'ankara', description:'Vibrant wax-print Ankara with bold geometric patterns. Perfect for traditional and contemporary wear.', price:4500, unit:'per yard', minOrder:1, bulkPrice:3800, bulkMin:10, badge:'Bestseller', inStock:true, featured:true, tags:['traditional','colorful','wax print'], pattern:'linear-gradient(145deg,#8B1A1A,#D4380D,#FA8C16,#1D6B1D,#003A8C)' },
  { name:'Guinea Brocade', category:'guinea', description:'Luxurious Guinea Brocade with intricate raised patterns and lustrous sheen. Perfect for ceremonies.', price:8500, unit:'per yard', minOrder:2, bulkPrice:7200, bulkMin:8, badge:'Premium', inStock:true, featured:true, tags:['ceremony','luxury','sheen'], pattern:'linear-gradient(135deg,#1a2a1a,#2d5a2d,#4a7c4a)' },
  { name:'Swiss Lace', category:'lace', description:'Exquisite Swiss lace with delicate floral embroidery. The choice of brides and queens.', price:12000, unit:'per yard', minOrder:3, bulkPrice:10500, bulkMin:6, badge:'Exclusive', inStock:true, featured:true, tags:['wedding','lace','embroidery'], pattern:'linear-gradient(135deg,#0d0d2e,#1a1a4a,#0d2e4a)' },
  { name:'Senator Material', category:'senator', description:'Premium Senator fabric for men — polished, regal and perfect for any native occasion.', price:6500, unit:'per yard', minOrder:2, bulkPrice:5500, bulkMin:8, badge:'Trending', inStock:true, featured:true, tags:['senator','male','native','formal'], pattern:'repeating-linear-gradient(0deg,rgba(201,168,76,0.15) 0,rgba(201,168,76,0.15) 1px,transparent 0,transparent 12px),linear-gradient(135deg,#0a0a1a,#1a1a2e,#0d1a0d)' },
  { name:'Embroidered Alhaji Cap', category:'cap', description:'Premium hand-embroidered Alhaji caps in various colours. A distinguished finish for any native outfit.', price:3500, unit:'per piece', minOrder:1, bulkPrice:2800, bulkMin:5, badge:'Handcrafted', inStock:true, featured:false, tags:['cap','alhaji','embroidered','male','accessory'], pattern:'radial-gradient(circle at 30% 30%,rgba(201,168,76,0.6),transparent 50%),linear-gradient(135deg,#1a0d00,#2d1a00)' },
  { name:'Bonnet Collection', category:'bonnet', description:'Quality bonnets for all types — satin-lined, lace-trimmed and everyday styles for every hair type.', price:1800, unit:'per piece', minOrder:1, bulkPrice:1400, bulkMin:10, badge:'All Types', inStock:true, featured:false, tags:['bonnet','hair','satin','accessories'], pattern:'radial-gradient(ellipse at 50% 20%,rgba(200,100,150,0.4),transparent 60%),linear-gradient(135deg,#1a0010,#0d001a)' },
  { name:"Children's Native Wear", category:'children', description:"Premium baby and children's native fabrics and ready-to-wear outfits. Adorable styles for little ones.", price:4500, unit:'per set', minOrder:1, bulkPrice:3800, bulkMin:5, badge:'Kids', inStock:true, featured:false, tags:['children','baby','kids','native'], pattern:"repeating-linear-gradient(45deg,rgba(255,180,50,0.3) 0,rgba(255,180,50,0.3) 4px,transparent 0,transparent 16px),linear-gradient(135deg,#001a10,#1a0010)" },
  { name:'Adire Eleko', category:'adire', description:"Authentic hand-resist dyed Adire. Each piece is unique, carrying the artisan's signature.", price:5500, unit:'per yard', minOrder:1, bulkPrice:4700, bulkMin:8, badge:'Artisan', inStock:true, featured:false, tags:['artisan','handmade','unique','indigo'], pattern:'radial-gradient(circle at 20% 20%,rgba(30,80,150,0.8),transparent 40%),linear-gradient(135deg,#050a1a,#0a1a3d)' },
];

const DEFAULT_SETTINGS: Record<string, unknown> = {
  hero: { eyebrow:'Native. Authentic. Luxurious.', titleLine1:'Where Tradition', titleLine2:'Meets Craft', subtitle:'Premium Ankara · Guinea · Lace · Aso-oke · Adire', ctaPrimary:'Explore Collection', ctaSecondary:'Our Fabrics', fabricCards:[{label:'Ankara',pattern:'linear-gradient(135deg,#1a1a1a,#3d2b1f)'},{label:'Guinea',pattern:'linear-gradient(135deg,#0d0d0d,#1c3a1c)'},{label:'Lace',pattern:'linear-gradient(135deg,#1a1a2e,#16213e)'}] },
  contact: { phone:'+2349074112695', email:'lumngfabrics@gmail.com', address:'Ilorin, Kwara State', storeAddress:'Ilorin, Kwara State.', hours:'Mon–Sat 8am–7pm' },
  footer: { tagline:'Premium unisex fabric store in Ilorin, Kwara. Look classy to your taste.', copyright:'© 2025 LUM NG. All rights reserved.' },
  seo: { siteTitle:'LUM NG — Unisex Fabric Store | Ilorin, Kwara', metaDescription:'LUM NG — premium unisex fabric store in Ilorin, Kwara. Lace, Ankara, Senator, Guinea, Bonnets, Alhaji Caps and more.' },
};

async function main() {
  console.log('🌱 Seeding LUMNG database...\n');

  const existingAdmin = await prisma.admin.findFirst();
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('lumng2025', 10);
    await prisma.admin.create({ data: { username: 'admin', passwordHash } });
    console.log('✅ Admin created (admin / lumng2025)');
  } else {
    console.log('⏩ Admin already exists');
  }

  const count = await prisma.product.count();
  if (count === 0) {
    await prisma.product.createMany({ data: DEFAULT_PRODUCTS });
    console.log(`✅ ${DEFAULT_PRODUCTS.length} products seeded`);
  } else {
    console.log(`⏩ ${count} products already exist`);
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as Prisma.InputJsonValue } });
  }
  console.log('✅ Settings seeded\n✨ Done!');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

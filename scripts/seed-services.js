import "dotenv/config";
import { MongoClient } from "mongodb";

const { MONGODB_URI, DB_NAME = "salonbook", ADMIN_EMAIL = "seed@salonbook.com" } = process.env;
if (!MONGODB_URI) throw new Error("MONGODB_URI is missing from .env");

const img = (seed) => `https://picsum.photos/seed/${seed}/800/600`;

const services = [
  // Hair
  { name: "Haircut & Styling", category: "hair", price: 800, duration: 45, image: img("haircut"),
    description: "Professional haircut with wash, blow-dry and styling tailored to your face shape and hair type." },
  { name: "Hair Coloring", category: "hair", price: 3500, duration: 120, image: img("haircolor"),
    description: "Full-head color with premium, ammonia-free products. Includes consultation, application and finishing." },

  // Skin
  { name: "Classic Facial", category: "skin", price: 1500, duration: 60, image: img("facial"),
    description: "Deep cleansing facial with exfoliation, steam, massage and a hydrating mask for glowing skin." },
  { name: "Anti-Acne Treatment", category: "skin", price: 2500, duration: 75, image: img("acne"),
    description: "Targeted treatment that cleans pores, calms breakouts and reduces redness with gentle active ingredients." },

  // Nails
  { name: "Classic Manicure", category: "nails", price: 700, duration: 40, image: img("manicure"),
    description: "Nail shaping, cuticle care, hand massage and your choice of polish for neat, healthy nails." },
  { name: "Gel Pedicure", category: "nails", price: 1800, duration: 60, image: img("pedicure"),
    description: "Relaxing foot soak, scrub, nail care and long-lasting gel polish that stays glossy for weeks." },

  // Makeup
  { name: "Party Makeup", category: "makeup", price: 3000, duration: 60, image: img("partymakeup"),
    description: "Full-face glam makeup for parties and events, with long-wear products and lashes included." },
  { name: "Engagement Makeup", category: "makeup", price: 6000, duration: 90, image: img("engagement"),
    description: "Soft, photo-ready makeup for engagement ceremonies, designed to match your outfit and skin tone." },

  // Spa
  { name: "Full Body Massage", category: "spa", price: 3500, duration: 90, image: img("massage"),
    description: "Relaxing full-body massage with aromatic oils to release tension and restore your energy." },
  { name: "Head & Shoulder Massage", category: "spa", price: 1200, duration: 30, image: img("headmassage"),
    description: "Quick stress-relief massage focused on the scalp, neck and shoulders. Perfect after a long day." },

  // Bridal
  { name: "Bridal Makeup Package", category: "bridal", price: 18000, duration: 180, image: img("bridal"),
    description: "Complete bridal makeup with hairstyling, draping help and touch-up kit for your big day." },
  { name: "Bridal Mehndi Design", category: "bridal", price: 5000, duration: 120, image: img("mehndi"),
    description: "Intricate hand and feet mehndi in traditional or modern designs using natural, skin-safe henna." },
];

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const col = client.db(DB_NAME).collection("services");
  const now = new Date();
  let added = 0;

  for (const [index, s] of services.entries()) {
    // Skip services that already exist (safe to run more than once).
    if (await col.findOne({ name: s.name })) continue;

    // Older timestamps for earlier items, so the Featured list order is predictable.
    const createdAt = new Date(now.getTime() + index * 1000);
    await col.insertOne({ ...s, status: "active", createdBy: ADMIN_EMAIL.toLowerCase(), createdAt, updatedAt: createdAt });
    added++;
  }

  console.log(`Added ${added} service(s), skipped ${services.length - added}.`);
} catch (error) {
  console.error("Service seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
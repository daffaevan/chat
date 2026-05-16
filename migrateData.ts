import sqlite3 from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase URL or Service Role Key in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const db = new sqlite3('chat.db');

async function migrate() {
  console.log("Starting migration from SQLite to Supabase...");

  try {
    // 1. Migrate Profiles
    console.log("Migrating profiles...");
    const users = db.prepare('SELECT * FROM users').all();
    for (const user of users as any[]) {
      console.log(`Migrating user: ${user.username}`);
      
      // We can't easily migrate password hashes if they are incompatible, 
      // but bcrypt is used in both so it might work.
      // However, we need to create them in Supabase Auth first OR just populate the profiles table.
      // population of profiles table requires a UUID. 
      // If we don't have the UUID yet, we'd need to create the user in Auth.
      
      const email = `${user.username.toLowerCase()}@pinkchat.local`;
      
      // Try to find if user already exists in Auth
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      let authUser = authUsers.users.find(u => u.email === email);
      
      if (!authUser) {
        console.log(`Creating auth user for ${email}...`);
        const { data: newAuth, error: authErr } = await supabase.auth.admin.createUser({
          email,
          password: 'TemporaryPassword123!', // They should probably reset or use old hash if compatible
          email_confirm: true,
          user_metadata: { username: user.username, displayName: user.displayName }
        });
        if (authErr) {
          console.error(`Error creating auth user ${email}:`, authErr.message);
          continue;
        }
        authUser = newAuth.user;
      }

      const uid = authUser.id;

      // Upsert profile
      const { error: profErr } = await supabase.from('profiles').upsert({
        uid,
        username: user.username.toLowerCase(),
        display_name: user.displayName,
        email,
        password: user.password, // Transferring the hash
        photo_url: user.photoURL,
        last_seen: user.lastSeen || Date.now()
      });
      
      if (profErr) {
        console.error(`Error upserting profile ${user.username}:`, profErr.message);
      } else {
        // Map old user ID to new UUID for sticker/message migration
        // In this app, the old ID was the same as username or a string.
        // Assuming user.id was used in other tables.
        
        console.log(`Migrating stickers for ${user.username}...`);
        const stickers = db.prepare('SELECT * FROM stickers WHERE userId = ?').all(user.id || user.uid || user.username);
        for (const sticker of stickers as any[]) {
          const { error: stErr } = await supabase.from('stickers').insert({
            url: sticker.url,
            user_id: uid,
            created_at: sticker.createdAt ? new Date(sticker.createdAt).toISOString() : new Date().toISOString()
          });
          if (stErr) console.error(`Error migrating sticker ${sticker.url}:`, stErr.message);
        }
        
        console.log(`Migrating messages for ${user.username}...`);
        const messages = db.prepare('SELECT * FROM messages WHERE senderId = ?').all(user.id || user.uid || user.username);
        for (const msg of messages as any[]) {
          const { error: msgErr } = await supabase.from('messages').insert({
            type: msg.type || 'text',
            text: msg.text,
            audio_url: msg.audioURL,
            audio_duration: msg.audioDuration,
            image_url: msg.imageUrl,
            sticker_url: msg.stickerUrl,
            sender_id: uid,
            sender_name: msg.senderName,
            sender_photo: msg.senderPhoto,
            reactions: msg.reactions ? JSON.parse(msg.reactions) : {},
            reply_to: msg.replyTo ? JSON.parse(msg.replyTo) : null,
            created_at: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString()
          });
          if (msgErr) console.error(`Error migrating message:`, msgErr.message);
        }
      }
    }

    console.log("Migration finished! 🎉");
  } catch (err) {
    console.error("Migration fatal error:", err);
  }
}

migrate();

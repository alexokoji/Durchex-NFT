import mongoose from "mongoose";
import path from "node:path";
import fs from "node:fs";

declare global {
  var __durchexMongoose: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  } | undefined;
}

const cached = (global.__durchexMongoose ??= { conn: null, promise: null });

async function resolveConnectionUri(): Promise<string> {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  if (process.env.NODE_ENV !== "production") {
    // Zero-config local dev: run a real local MongoDB (via mongodb-memory-server's
    // managed binary) backed by a fixed on-disk data directory + port, so the
    // `npm run seed` process and the `next dev` process share the same data
    // instead of each getting a throwaway in-memory database.
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const dbPath = path.join(process.cwd(), ".local-mongo-data");
    fs.mkdirSync(dbPath, { recursive: true });
    const mem = await MongoMemoryServer.create({
      instance: {
        port: 27117,
        dbPath,
        dbName: "durchex",
        storageEngine: "wiredTiger",
        launchTimeout: 120_000,
      },
    });
    return mem.getUri();
  }

  throw new Error("MONGODB_URI is not set");
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = resolveConnectionUri().then((uri) =>
      mongoose.connect(uri, { dbName: "durchex", bufferCommands: false })
    );
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

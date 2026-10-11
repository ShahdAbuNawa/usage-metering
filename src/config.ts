try {
  process.loadEnvFile();
} catch {
  // No .env file (for example inside Docker): use the real environment variables.
}

function envOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: Number(envOrThrow("PORT")),
  dbUrl: envOrThrow("DB_URL"),
};
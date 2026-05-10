export const DEFAULT_R2_BUCKET_NAME = 'tora-player-audio';

export const REQUIRED_R2_CREDENTIAL_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

export type R2ConfigEnv = Record<string, string | undefined> &
  Partial<Record<(typeof REQUIRED_R2_CREDENTIAL_ENV)[number] | 'R2_BUCKET_NAME', string | undefined>>;

export function getR2BucketName(env: R2ConfigEnv = process.env) {
  return (env.R2_BUCKET_NAME || DEFAULT_R2_BUCKET_NAME).trim();
}

export function isR2RuntimeConfigured(env: R2ConfigEnv = process.env) {
  return (
    REQUIRED_R2_CREDENTIAL_ENV.every((key) => Boolean(env[key]?.trim())) &&
    Boolean(getR2BucketName(env))
  );
}

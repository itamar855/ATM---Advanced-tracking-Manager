/**
 * Chaves VAPID (Voluntary Application Server Identification) para Web Push no iOS e Android.
 */

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BNns6Juo7YmWhSBL1wlCx8Of5uRG-RYwTHXBALX3K9qvnUvT3UhGG9OYZppyYHk-SnJRxnXtRwA7a0W4ZaxbZ9E";

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "ZlJFaQ4TAAk_JDv80CQWBAtc9FK27npzjGQFkRaD9sw";

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:suporte@atmadspro.com";

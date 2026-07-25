export const DEVICE_NODE_ID =
  process.env.NEXT_PUBLIC_DEVICE_NODE_ID ?? "device-s22";

export const DEVICE_STALE_MS = Number(
  process.env.NEXT_PUBLIC_DEVICE_STALE_MS ?? 8000
);

export interface DeviceBounds {
  T_warn: number;
  T_max: number;
  L_max: number;
  X_nominal: number;
}

export const DEVICE_BOUNDS: DeviceBounds = {
  T_warn: Number(process.env.DEVICE_T_WARN ?? 37),
  T_max: Number(process.env.DEVICE_T_MAX ?? 41),
  L_max: Number(process.env.DEVICE_L_MAX ?? 0.85),
  X_nominal: Number(process.env.DEVICE_X_NOMINAL ?? 1000),
};

export const DEVICE_OPERATOR = process.env.DEVICE_OPERATOR ?? "opC";
export const DEVICE_LABEL = process.env.DEVICE_LABEL ?? "Galaxy S22";
export const DEVICE_POSITION: [number, number, number] = [5, 0, 2];

export const DEVICE_EDGES: { to: string; weight: number }[] = [
  { to: "node-15", weight: 0.4 },
  { to: "node-11", weight: 0.6 },
];

export function deviceOwnsStatus(): boolean {
  return process.env.DEVICE_OWNS_STATUS !== "false";
}

export function deviceTokenConfigured(): boolean {
  return Boolean(process.env.DEVICE_TOKEN);
}

export function authorizeDevice(request: Request): string | null {
  const expected = process.env.DEVICE_TOKEN;
  if (!expected) {
    return "DEVICE_TOKEN is not set in the repo-root .env.local";
  }
  const header = request.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) return "missing Authorization: Bearer <DEVICE_TOKEN>";
  if (presented !== expected) return "device token rejected";
  return null;
}

export type DeviceStatus =
  | "healthy"
  | "warning"
  | "violation"
  | "isolated"
  | "offline";

export function classifyDevice(
  temp: number | null,
  load: number | null,
  bounds: DeviceBounds = DEVICE_BOUNDS
): { status: DeviceStatus; reasons: string[] } {
  const reasons: string[] = [];

  if (temp !== null && temp >= bounds.T_max) {
    reasons.push(
      `battery temperature ${temp.toFixed(1)}C at or above T_max ${bounds.T_max}C`
    );
  }
  if (load !== null && load >= bounds.L_max) {
    reasons.push(
      `cpu load ${(load * 100).toFixed(0)}% at or above L_max ${(bounds.L_max * 100).toFixed(0)}%`
    );
  }
  if (reasons.length > 0) return { status: "violation", reasons };

  if (temp !== null && temp >= bounds.T_warn) {
    reasons.push(
      `battery temperature ${temp.toFixed(1)}C above T_warn ${bounds.T_warn}C`
    );
  }
  if (load !== null && load >= bounds.L_max * 0.85) {
    reasons.push(`cpu load ${(load * 100).toFixed(0)}% approaching L_max`);
  }
  if (reasons.length > 0) return { status: "warning", reasons };

  return { status: "healthy", reasons };
}

export function isDeviceStale(
  lastSeenAt: number | null | undefined,
  now = Date.now(),
  window = DEVICE_STALE_MS
): boolean {
  if (!lastSeenAt) return true;
  return now - lastSeenAt > window;
}

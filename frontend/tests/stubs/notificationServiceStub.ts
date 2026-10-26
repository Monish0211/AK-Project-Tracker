// Test double for src/notifications/notificationService.ts. The real module starts the notification engine on a microtask at import
// time, which under server-side module loading races its import cycle with projectService ("getProjects is not a function").
// These permission tests never read notifications, so every method is a no-op.
export const notificationService: Record<string, unknown> = new Proxy({}, { get: () => () => undefined });

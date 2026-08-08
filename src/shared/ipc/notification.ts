import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const notificationInputSchema = z.object({
  entityId: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
  alertType: z.enum(['food-expiry', 'budget-limit', 'subscription-due', 'watch-target', 'watch-safety', 'important-date', 'next-event']),
  occurrenceAt: z.string().datetime({ offset: false }),
  title: z.string().trim().min(1).max(100).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  body: z.string().trim().min(1).max(500).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
}).strict();

export type NotificationInput = z.infer<typeof notificationInputSchema>;
export type DeliveryStatus = 'delivered' | 'duplicate';

/** Side effects: invokes validated Tauri IPC; Rust may write a delivery receipt and display one OS notification. */
export async function deliverNotification(input: NotificationInput): Promise<DeliveryStatus> {
  return invoke<DeliveryStatus>('deliver_notification', { input: notificationInputSchema.parse(input) });
}

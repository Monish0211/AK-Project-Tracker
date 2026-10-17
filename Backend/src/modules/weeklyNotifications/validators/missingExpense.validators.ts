import { z } from "zod";

/** Shape check only — address validation and duplicate rejection happen in the service (validateRecipients). */
export const updateMissingExpenseRecipientsSchema = z.object({
  toEmail: z.string().trim().min(1, "The To address is required.").max(320),
  cc: z
    .array(
      z.object({
        email: z.string().trim().max(320).optional(),
        portalUserId: z.string().uuid().nullable().optional(),
      })
    )
    .max(50, "At most 50 CC recipients."),
});

export type UpdateMissingExpenseRecipientsBody = z.infer<typeof updateMissingExpenseRecipientsSchema>;

/** "manual" = an extra run now (own period key); "retry-weekly" = (re)run this week's scheduled run, respecting "already sent". */
export const runMissingExpenseJobSchema = z.object({
  mode: z.enum(["manual", "retry-weekly"]).default("manual"),
});

-- READ-ONLY audit (no writes) of Project Workspace reminder times after project-country time zones. Safe to run on any copy of the database inside a
-- read-only transaction (BEGIN READ ONLY; ... ROLLBACK;). Nothing is converted or rewritten.
--
--   legacy           "dueAt" IS NULL: saved before project time zones. NOT converted; keeps its previous behaviour (read in the viewer's own clock) until someone
--                    saves a new date or time. For an India project this matches India time on any India-clock device.
--   project_zone     "dueAt" set: the project's local date + time stored as one UTC instant in "timeZone".
--   no_country       the project has no country, so no zone can be applied (never guessed).
--   invalid_zone     "timeZone" is not one of the five zones used by the seven countries.
--   zone_mismatch    "timeZone" differs from the zone of the project's CURRENT country (the project's country was changed after the reminder was saved).
--   inconsistent     "dueAt" does not equal the local date + time read in "timeZone" (should be 0).

-- 1. Summary by project country.
WITH zone_of(name, zone) AS (VALUES ('India','Asia/Kolkata'),('Malaysia','Asia/Kuala_Lumpur'),('Oman','Asia/Muscat'),('Abu Dhabi','Asia/Dubai'),('FZI','Asia/Dubai'),('Elixir Qatar','Asia/Qatar'),('Qatar','Asia/Qatar'))
SELECT coalesce(nullif(trim(g."displayName"), ''), g.name, '(no country)')                                                     AS country,
       count(*)                                                                                                                AS reminders,
       count(*) FILTER (WHERE r."dueAt" IS NULL)                                                                               AS legacy,
       count(*) FILTER (WHERE r."dueAt" IS NULL AND r.status = 'Pending' AND NOT r."isCompleted")                               AS legacy_pending,
       count(*) FILTER (WHERE r."dueAt" IS NOT NULL)                                                                           AS project_zone,
       count(*) FILTER (WHERE p."regionId" IS NULL)                                                                            AS no_country,
       count(*) FILTER (WHERE r."timeZone" IS NOT NULL AND r."timeZone" NOT IN (SELECT zone FROM zone_of))                     AS invalid_zone,
       count(*) FILTER (WHERE r."timeZone" IS NOT NULL AND z.zone IS NOT NULL AND r."timeZone" <> z.zone)                      AS zone_mismatch,
       count(*) FILTER (WHERE r."dueAt" IS NOT NULL AND r."timeZone" IN (SELECT zone FROM zone_of)
                          AND r."reminderTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                          AND r."dueAt" <> ((r."reminderDate"::date + r."reminderTime"::time) AT TIME ZONE r."timeZone") AT TIME ZONE 'UTC') AS inconsistent
FROM "ProjectReminder" r
JOIN "Project" p ON p.id = r."projectId"
LEFT JOIN "Region" g ON g.id = p."regionId"
LEFT JOIN zone_of z ON z.name = g.name
GROUP BY 1
ORDER BY 1;

-- 2. Pending legacy reminders on projects OUTSIDE India: their owners should confirm the intended local time (re-saving the date/time stores it in the project's zone).
SELECT coalesce(nullif(trim(g."displayName"), ''), g.name, '(no country)') AS country, p."prNo", r.title, to_char(r."reminderDate", 'YYYY-MM-DD') AS date, r."reminderTime" AS time, r."createdBy"
FROM "ProjectReminder" r
JOIN "Project" p ON p.id = r."projectId"
LEFT JOIN "Region" g ON g.id = p."regionId"
WHERE r."dueAt" IS NULL AND r.status = 'Pending' AND NOT r."isCompleted" AND coalesce(g.name, '') <> 'India'
ORDER BY 1, r."reminderDate", r."reminderTime"
LIMIT 200;

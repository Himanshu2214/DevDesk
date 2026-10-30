-- Google Calendar (or Outlook / Apple) meetings in the Calendar page: the calendar's private iCal address,
-- read by the calendar-feed edge function. Kept in the user's own settings row (row level security: own rows only).
alter table public.user_settings add column "CalendarUrl" text
  check ("CalendarUrl" is null or ("CalendarUrl" ~ '^https://' and length("CalendarUrl") <= 2000));

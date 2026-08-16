import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const TAIPEI_UTC_OFFSET_HOURS = 8;

// Timestamps with no offset/"Z" suffix (SQLite's shape, see
// queries.py's docstring) parse as local time by default — treat them as
// UTC explicitly by normalizing to an unambiguous ISO string first.
// Timestamps that already carry an offset (Postgres may include one) are
// passed through as-is.
const HAS_OFFSET = /[Zz]$|[+-]\d\d:?\d\d$/;

/**
 * Format a DB timestamp (stored as UTC — see queries.py) as Taiwan local
 * time. Dashboard users are all in Asia/Taipei, which never observes DST,
 * so a fixed +8 offset is used rather than the timezone plugin.
 */
export function formatTaipeiDateTime(utcTimestamp: string): string {
  const trimmed = utcTimestamp.trim();
  const iso = HAS_OFFSET.test(trimmed)
    ? trimmed
    : `${trimmed.replace(" ", "T")}Z`;
  return dayjs
    .utc(iso)
    .utcOffset(TAIPEI_UTC_OFFSET_HOURS)
    .format("YYYY-MM-DD HH:mm:ss");
}

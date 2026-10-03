import {
  addDaysToDateKey,
  getNewspaperDateKey,
  getNewspaperDayBounds,
} from "@/app/newspaper/lib/timezone";
import { HORIZONS } from "./config";
import type { EditionInput } from "./schema";

const HOUR = 3_600_000;
export function editionWindow(
  input: EditionInput,
  lastChatDay: string,
  now = new Date(),
) {
  const end = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
  const hours = HORIZONS[input.horizon].hours;
  const start = hours
    ? new Date(end.getTime() - hours * HOUR)
    : getNewspaperDayBounds(getNewspaperDateKey(now)).startDate;
  const beforeEdition = addDaysToDateKey(getNewspaperDateKey(start), -1);
  // Blind mode never shows the model real messages from the edition period.
  const voiceTo =
    input.blind && beforeEdition < lastChatDay ? beforeEdition : lastChatDay;
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    voiceFrom: addDaysToDateKey(voiceTo, 1 - input.voiceDays),
    voiceTo,
  };
}

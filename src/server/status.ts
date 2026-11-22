import { DIRECT_TRANSCRIBE_MAX_BYTES, MAX_RECORDING_SEC, RECORDING_SEGMENT_SEC } from "../lib/limits.ts";
import type { AppStatus } from "../lib/types.ts";
import { hasFfmpeg } from "./audio.ts";
import { aiConfig } from "./openai.ts";
import { getSettings } from "./settings.ts";
import { maxUploadBytes } from "./uploads.ts";

export async function appStatus(userId: string): Promise<AppStatus> {
  const settings = await getSettings(userId);
  return {
    configured: aiConfig().configured,
    ffmpeg: hasFfmpeg(),
    plan: "pro_plus",
    limits: {
      maxRecordingSec: MAX_RECORDING_SEC,
      recordingSegmentSec: RECORDING_SEGMENT_SEC,
      maxUploadBytes: maxUploadBytes(),
      directTranscribeMaxBytes: DIRECT_TRANSCRIBE_MAX_BYTES,
    },
    settings,
    speakersAvailable: Boolean(settings.diarizeModel),
  };
}

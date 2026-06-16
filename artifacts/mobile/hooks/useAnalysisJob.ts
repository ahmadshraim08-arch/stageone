import { useRef, useCallback } from "react";
import { getAnalysisJob, type ApiAnalysisJob } from "@/lib/api";

const MIN_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 10_000;
const BACKOFF_FACTOR = 1.5;

export function useAnalysisJob() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef(MIN_INTERVAL_MS);
  const canceledRef = useRef(false);

  const stop = useCallback(() => {
    canceledRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    (
      token: string,
      jobId: string,
      onUpdate: (job: ApiAnalysisJob) => void,
      onDone: (job: ApiAnalysisJob) => void,
      onError: (err: Error) => void,
    ) => {
      canceledRef.current = false;
      intervalRef.current = MIN_INTERVAL_MS;

      const tick = async () => {
        if (canceledRef.current) return;
        try {
          const job = await getAnalysisJob(token, jobId);
          if (canceledRef.current) return;
          onUpdate(job);
          if (
            job.status === "ready" ||
            job.status === "failed" ||
            job.status === "canceled"
          ) {
            onDone(job);
            return;
          }
          // Backoff until next poll
          intervalRef.current = Math.min(
            intervalRef.current * BACKOFF_FACTOR,
            MAX_INTERVAL_MS,
          );
          timerRef.current = setTimeout(tick, intervalRef.current);
        } catch (err) {
          if (canceledRef.current) return;
          intervalRef.current = Math.min(
            intervalRef.current * BACKOFF_FACTOR,
            MAX_INTERVAL_MS,
          );
          timerRef.current = setTimeout(tick, intervalRef.current);
          if (err instanceof Error) onError(err);
        }
      };

      timerRef.current = setTimeout(tick, MIN_INTERVAL_MS);
    },
    [],
  );

  return { poll, stop };
}

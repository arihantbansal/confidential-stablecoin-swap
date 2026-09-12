import { useEffect, useState, useSyncExternalStore } from "react";
import { createApplication } from "@/lib/application";

export function useApplication() {
  const [application] = useState(createApplication);
  const state = useSyncExternalStore(
    application.subscribe,
    application.getSnapshot,
  );
  useEffect(() => application.start(), [application]);
  return { state, application };
}

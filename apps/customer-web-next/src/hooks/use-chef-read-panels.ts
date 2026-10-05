"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  captureSessionContext,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  subscribeSession,
} from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";

type PanelStatus = "loading" | "ready" | "error";
export type ChefReadPanel<T> = { status: PanelStatus; data: T | undefined; error: string };
type PanelSource<T> = { path: string; label: string; decode: (raw: unknown) => T };
type Sources = Record<string, PanelSource<unknown>>;
type Panels<S extends Sources> = {
  [K in keyof S]: ChefReadPanel<ReturnType<S[K]["decode"]>>;
};

export const CHEF_PANEL_TIMEOUT_MS = 15_000;

function ownerScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, canReadChef()]);
}
const serverScope = () => "server";

function canReadChef(): boolean {
  return isSessionReady() && getSession()?.roles.includes("CHEF") === true;
}

function emptyPanels<S extends Sources>(sources: S): Panels<S> {
  return Object.fromEntries(
    Object.keys(sources).map((key) => [
      key,
      {
        status: "loading",
        data: undefined,
        error: "",
      },
    ]),
  ) as Panels<S>;
}

/** Read-only chef sections settle independently, and never cross a login change. */
export function useChefReadPanels<S extends Sources>(sources: S) {
  const scope = useSyncExternalStore(subscribeSession, ownerScope, serverScope);
  const [revision, setRevision] = useState(0);
  const requestRevision = useRef(0);
  const [snapshot, setSnapshot] = useState(() => ({
    scope: "server",
    panels: emptyPanels(sources),
    updatedAt: null as Date | null,
  }));

  useEffect(() => {
    const context = captureSessionContext();
    const currentRevision = ++requestRevision.current;
    let active = true;
    const controllers: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const current = () =>
      active &&
      currentRevision === requestRevision.current &&
      canReadChef() &&
      isSessionContextCurrent(context);

    setSnapshot({ scope, panels: emptyPanels(sources), updatedAt: null });
    for (const [key, source] of Object.entries(sources)) {
      const controller = new AbortController();
      controllers.push(controller);
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`${source.label} took too long to load. Please try again.`));
        }, CHEF_PANEL_TIMEOUT_MS);
        timers.push(timer);
      });
      const read = async () => {
        if (!current() || context.identityId === null)
          throw new Error("Your chef session is unavailable.");
        const response = await sessionFetch(source.path, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${source.label} could not load. Please try again.`);
        return source.decode(await response.json());
      };
      void Promise.race([read(), timeout])
        .then((data) => {
          if (!current()) return;
          setSnapshot((previous) =>
            previous.scope === scope
              ? {
                  ...previous,
                  panels: { ...previous.panels, [key]: { status: "ready", data, error: "" } },
                  updatedAt: new Date(),
                }
              : previous,
          );
        })
        .catch((caught) => {
          if (!current()) return;
          setSnapshot((previous) =>
            previous.scope === scope
              ? {
                  ...previous,
                  panels: {
                    ...previous.panels,
                    [key]: {
                      status: "error",
                      data: undefined,
                      error:
                        caught instanceof Error
                          ? caught.message
                          : `${source.label} is unavailable.`,
                    },
                  },
                }
              : previous,
          );
        })
        .finally(() => clearTimeout(timer));
    }
    return () => {
      active = false;
      controllers.forEach((controller) => controller.abort());
      timers.forEach(clearTimeout);
    };
  }, [scope, revision, sources]);

  const panels = snapshot.scope === scope ? snapshot.panels : emptyPanels(sources);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const pending = Object.values(panels).some((panel) => panel.status === "loading");
  return {
    panels,
    refresh,
    pending,
    updatedAt: snapshot.scope === scope ? snapshot.updatedAt : null,
  };
}

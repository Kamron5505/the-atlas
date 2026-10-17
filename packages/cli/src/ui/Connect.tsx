import { listModels, PROVIDERS, resolveProvider, saveConfig, type AtlasConfig, type ProviderDef } from "@the-atlas/core";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useEffect, useRef, useState } from "react";
import type { Dict } from "../i18n.js";
import { loginOpenRouter } from "../oauth.js";
import { installOmniroute, omnirouteInstalled, omnirouteUp, OMNIROUTE_URL, openUrl, startOmniroute } from "../system.js";
import { Select, type SelectItem } from "./Select.js";
import { C, I, SPINNER } from "./theme.js";

type Step =
  | { kind: "pick" }
  | { kind: "key"; def: ProviderDef }
  | { kind: "oauth"; def: ProviderDef }
  | { kind: "busy"; def: ProviderDef; text: string }
  | { kind: "error"; def: ProviderDef; text: string }
  | { kind: "local"; def: ProviderDef };

const isLocal = (def: ProviderDef) => !def.keyRequired;
export const shortName = (def: ProviderDef) => def.name.replace(/ \(local\)$/, "");

export function providerItems(cfg: AtlasConfig, L: Dict): SelectItem<ProviderDef>[] {
  const order = [L.groupFree, L.groupLocal, L.groupPaid];
  return PROVIDERS.map((def) => {
    const p = resolveProvider(cfg, def.id)!;
    const connected = def.keyRequired && !!p.apiKey;
    const group = isLocal(def) ? L.groupLocal : def.free ? L.groupFree : L.groupPaid;
    return {
      key: def.id,
      label: shortName(def),
      value: def,
      on: connected,
      tag: isLocal(def) ? ("local" as const) : def.free ? ("free" as const) : ("paid" as const),
      hint: connected ? L.connected : isLocal(def) ? L.noKeyNeeded : def.id === "openrouter" ? L.oauthHint : (def.signupUrl?.replace(/^https?:\/\//, "") ?? ""),
      group,
    };
  }).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** OpenRouter signs in through the browser (OAuth); others take a pasted key; local ones are probed. */
function firstStep(def: ProviderDef): Step {
  if (def.id === "openrouter") return { kind: "oauth", def };
  return def.keyRequired ? { kind: "key", def } : { kind: "local", def };
}

/**
 * Pick an AI → its key page opens → paste key → verified.
 * `onStep` receives answered questions ("✔ question answer") for the transcript.
 */
export function Connect({
  cfg,
  L,
  onDone,
  onStep,
  initial,
}: {
  cfg: AtlasConfig;
  L: Dict;
  onDone: (msg: string | null, providerId?: string) => void;
  onStep?: (question: string, answer: string) => void;
  initial?: string;
}) {
  const start = initial ? PROVIDERS.find((p) => p.id === initial) : undefined;
  const [step, setStep] = useState<Step>(start ? firstStep(start) : { kind: "pick" });
  const oauthAbort = useRef<AbortController | null>(null);
  const [key, setKey] = useState("");

  useInput(
    (i, k) => {
      if (step.kind === "oauth" && i === "k") {
        oauthAbort.current?.abort();
        return setStep({ kind: "key", def: step.def });
      }
      if (k.escape) {
        oauthAbort.current?.abort();
        return onDone(null);
      }
      if (step.kind === "error" && k.return) setStep(step.def.keyRequired ? firstStep(step.def) : { kind: "pick" });
    },
    { isActive: step.kind !== "pick" },
  );

  useEffect(() => {
    if (step.kind === "key" && step.def.signupUrl) openUrl(step.def.signupUrl);
    if (step.kind === "local") void connectLocal(step.def);
    if (step.kind === "oauth") void signIn(step.def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  async function connectLocal(def: ProviderDef) {
    if (def.id === "omniroute") {
      setStep({ kind: "busy", def, text: `${L.checking} OmniRoute` });
      if (!(await omnirouteUp(cfg.baseURLs.omniroute ?? OMNIROUTE_URL))) {
        if (!omnirouteInstalled()) {
          setStep({ kind: "busy", def, text: L.installing });
          if ((await installOmniroute()) !== 0) return setStep({ kind: "error", def, text: L.omniInstallFail });
        }
        setStep({ kind: "busy", def, text: L.starting });
        if (!(await startOmniroute())) return setStep({ kind: "error", def, text: L.omniFail });
      }
      openUrl(OMNIROUTE_URL);
      return onDone(`${L.omniOk} · ${OMNIROUTE_URL}`, def.id);
    }
    setStep({ kind: "busy", def, text: `${L.checking} ${shortName(def)}` });
    try {
      const models = await listModels(resolveProvider(cfg, def.id)!, AbortSignal.timeout(4000));
      onDone(`${shortName(def)} · ${models.length} ${L.modelsAvailable}`, def.id);
    } catch {
      setStep({ kind: "error", def, text: `${shortName(def)} ${L.notRunning} ${def.signupUrl}` });
    }
  }

  async function signIn(def: ProviderDef) {
    const ctrl = new AbortController();
    oauthAbort.current = ctrl;
    try {
      const key = await loginOpenRouter({ signal: ctrl.signal });
      await verify(def, key);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setStep({ kind: "error", def, text: (err as Error).message });
    }
  }

  async function verify(def: ProviderDef, value: string) {
    const k = value.trim();
    if (!k) return;
    setStep({ kind: "busy", def, text: L.verifying });
    const p = { ...resolveProvider(cfg, def.id)!, apiKey: k };
    try {
      const models = await listModels(p, AbortSignal.timeout(10000));
      cfg.keys[def.id] = k;
      saveConfig(cfg);
      setKey("");
      const n = models.filter((m) => m.free).length || models.length;
      onDone(`${L.keyOk} · ${shortName(def)} · ${n} ${L.modelsAvailable}`, def.id);
    } catch (err) {
      setKey("");
      setStep({ kind: "error", def, text: (err as Error).message });
    }
  }

  if (step.kind === "pick") {
    return (
      <Select
        L={L}
        title={L.connectTitle}
        items={providerItems(cfg, L)}
        height={16}
        onCancel={() => onDone(null)}
        onSelect={(it) => {
          onStep?.(L.connectTitle, it.label);
          setStep(firstStep(it.value));
        }}
      />
    );
  }

  const site = step.def.signupUrl?.replace(/^https?:\/\//, "");
  return (
    <Box flexDirection="column">
      {step.kind === "key" && (
        <>
          <Text>
            <Text color={C.neon} bold>
              ?{" "}
            </Text>
            <Text color={C.text} bold>
              {shortName(step.def)} · {L.keyAsk}
            </Text>
            {site && (
              <Text color={C.faint}>
                {"  "}({L.browserOpened}: <Text color={C.blue}>{site}</Text>)
              </Text>
            )}
          </Text>
          <Box paddingLeft={2}>
            <Text color={C.neon}>{I.pointer} </Text>
            <TextInput value={key} onChange={setKey} onSubmit={(v) => verify(step.def, v)} mask="•" placeholder="sk-…" />
          </Box>
          <Box paddingLeft={2}>
            <Text color={C.faint}>{L.keyStored}</Text>
          </Box>
        </>
      )}
      {step.kind === "oauth" && (
        <>
          <Text color={C.glow}>
            <Spinner type={SPINNER} /> {L.oauthWait}
          </Text>
          <Box paddingLeft={2}>
            <Text color={C.faint}>{L.oauthManual}</Text>
          </Box>
        </>
      )}
      {step.kind === "busy" && (
        <Text color={C.glow}>
          <Spinner type={SPINNER} /> {step.text}
        </Text>
      )}
      {step.kind === "error" && (
        <>
          <Text color={C.err}>
            {I.fail} {step.text}
          </Text>
          <Box paddingLeft={2}>
            <Text color={C.faint}>{L.retry}</Text>
          </Box>
        </>
      )}
    </Box>
  );
}

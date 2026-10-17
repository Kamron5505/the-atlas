import { listModels, PROVIDERS, resolveProvider, saveConfig, type AtlasConfig, type ProviderDef } from "@the-atlas/core";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import type { Dict } from "../i18n.js";
import { installOmniroute, omnirouteInstalled, omnirouteUp, OMNIROUTE_URL, openUrl, startOmniroute } from "../system.js";
import { Select, type SelectItem } from "./Select.js";
import { C, I } from "./theme.js";

type Step =
  | { kind: "pick" }
  | { kind: "key"; def: ProviderDef }
  | { kind: "busy"; def: ProviderDef; text: string }
  | { kind: "error"; def: ProviderDef; text: string }
  | { kind: "local"; def: ProviderDef };

const isLocal = (def: ProviderDef) => !def.keyRequired;

export function providerItems(cfg: AtlasConfig, L: Dict): SelectItem<ProviderDef>[] {
  const order = [L.groupFree, L.groupLocal, L.groupPaid];
  return PROVIDERS.map((def) => {
    const p = resolveProvider(cfg, def.id)!;
    const connected = def.keyRequired && !!p.apiKey;
    const group = isLocal(def) ? L.groupLocal : def.free ? L.groupFree : L.groupPaid;
    return {
      key: def.id,
      label: def.name.replace(/ \(local\)$/, ""),
      value: def,
      on: connected,
      tag: isLocal(def) ? ("local" as const) : def.free ? ("free" as const) : ("paid" as const),
      hint: connected ? L.connected : isLocal(def) ? L.noKeyNeeded : (def.signupUrl?.replace(/^https?:\/\//, "") ?? ""),
      group,
    };
  }).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** Pick an AI → open its key page → paste key → verify → saved. */
export function Connect({
  cfg,
  L,
  onDone,
  initial,
}: {
  cfg: AtlasConfig;
  L: Dict;
  onDone: (msg: string | null, providerId?: string) => void;
  initial?: string;
}) {
  const start = initial ? PROVIDERS.find((p) => p.id === initial) : undefined;
  const [step, setStep] = useState<Step>(start ? (start.keyRequired ? { kind: "key", def: start } : { kind: "local", def: start }) : { kind: "pick" });
  const [key, setKey] = useState("");

  useInput(
    (_i, k) => {
      if (k.escape) onDone(null);
      if (step.kind === "error" && k.return) setStep(step.def.keyRequired ? { kind: "key", def: step.def } : { kind: "pick" });
    },
    { isActive: step.kind !== "pick" },
  );

  useEffect(() => {
    if (step.kind === "key" && step.def.signupUrl) openUrl(step.def.signupUrl);
    if (step.kind === "local") void connectLocal(step.def);
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
      return onDone(`${L.omniOk}: ${OMNIROUTE_URL}`, def.id);
    }
    setStep({ kind: "busy", def, text: `${L.checking} ${def.name}` });
    try {
      const models = await listModels(resolveProvider(cfg, def.id)!, AbortSignal.timeout(4000));
      onDone(`${def.name} · ${models.length} ${L.modelsAvailable}`, def.id);
    } catch {
      setStep({ kind: "error", def, text: `${def.name} ${L.notRunning} ${def.signupUrl}` });
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
      onDone(`${def.name} ${L.connected} · ${n} ${L.modelsAvailable}`, def.id);
    } catch (err) {
      setKey("");
      setStep({ kind: "error", def, text: (err as Error).message });
    }
  }

  if (step.kind === "pick") {
    return (
      <Select
        L={L}
        title={`${I.star} ${L.connectTitle}`}
        items={providerItems(cfg, L)}
        height={16}
        onCancel={() => onDone(null)}
        onSelect={(it) => setStep(it.value.keyRequired ? { kind: "key", def: it.value } : { kind: "local", def: it.value })}
      />
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={step.kind === "error" ? C.err : C.neon} paddingX={1}>
      <Text color={C.neon} bold>
        {I.star} {step.def.name}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {step.kind === "key" && (
          <>
            <Text color={C.user}>{L.step1}</Text>
            {step.def.signupUrl && <Text color={C.blue}>   {step.def.signupUrl}</Text>}
            <Text color={C.user}>{L.step2}</Text>
            <Box marginTop={1} borderStyle="round" borderColor={C.faint} paddingX={1}>
              <Text color={C.neon}>{I.prompt} </Text>
              <TextInput value={key} onChange={setKey} onSubmit={(v) => verify(step.def, v)} mask="•" placeholder="API key" />
            </Box>
          </>
        )}
        {step.kind === "busy" && (
          <Text color={C.glow}>
            <Spinner type="dots" /> {step.text}
          </Text>
        )}
        {step.kind === "error" && (
          <Text color={C.err}>
            {I.fail} {step.text}
          </Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={C.faint}>{step.kind === "error" ? L.retry : L.keyStored}</Text>
      </Box>
    </Box>
  );
}

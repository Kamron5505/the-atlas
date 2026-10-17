import { listModels, PROVIDERS, resolveProvider, saveConfig, type AtlasConfig, type ProviderDef } from "@the-atlas/core";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { installOmniroute, omnirouteInstalled, omnirouteUp, OMNIROUTE_URL, openUrl, startOmniroute } from "../system.js";
import { Select, type SelectItem } from "./Select.js";
import { C } from "./theme.js";

type Step =
  | { kind: "pick" }
  | { kind: "key"; def: ProviderDef }
  | { kind: "busy"; def: ProviderDef; text: string }
  | { kind: "error"; def: ProviderDef; text: string }
  | { kind: "local"; def: ProviderDef };

export function providerItems(cfg: AtlasConfig): SelectItem<ProviderDef>[] {
  return PROVIDERS.map((def) => {
    const p = resolveProvider(cfg, def.id)!;
    const connected = def.keyRequired ? !!p.apiKey : false;
    return {
      key: def.id,
      label: def.name,
      value: def,
      badge: def.free ? "🆓" : "💳",
      hint: connected ? "● connected" : def.keyRequired ? (def.signupUrl?.replace(/^https?:\/\//, "") ?? "") : "local · no key",
      group: def.id === "omniroute" || def.id === "ollama" ? "Local gateways" : def.free ? "Free tier" : "Paid",
    };
  }).sort((a, b) => ["Free tier", "Local gateways", "Paid"].indexOf(a.group!) - ["Free tier", "Local gateways", "Paid"].indexOf(b.group!));
}

/** Pick an AI → open its key page → paste key → verify → saved. */
export function Connect({ cfg, onDone, initial }: { cfg: AtlasConfig; onDone: (msg: string | null, providerId?: string) => void; initial?: string }) {
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
      setStep({ kind: "busy", def, text: "checking OmniRoute…" });
      if (!(await omnirouteUp(cfg.baseURLs.omniroute ?? OMNIROUTE_URL))) {
        if (!omnirouteInstalled()) {
          setStep({ kind: "busy", def, text: "installing OmniRoute (npm i -g omniroute)… ~1 min" });
          if ((await installOmniroute()) !== 0) return setStep({ kind: "error", def, text: "npm install -g omniroute failed — run it manually" });
        }
        setStep({ kind: "busy", def, text: "starting OmniRoute…" });
        if (!(await startOmniroute())) return setStep({ kind: "error", def, text: "OmniRoute did not start. Run `omniroute` in another terminal." });
      }
      openUrl(OMNIROUTE_URL);
      return onDone(`OmniRoute connected · add accounts in its dashboard: ${OMNIROUTE_URL}`, def.id);
    }
    setStep({ kind: "busy", def, text: `checking ${def.name}…` });
    try {
      const models = await listModels(resolveProvider(cfg, def.id)!, AbortSignal.timeout(4000));
      onDone(`${def.name} connected · ${models.length} models`, def.id);
    } catch {
      setStep({ kind: "error", def, text: `${def.name} is not running. Install: ${def.signupUrl}` });
    }
  }

  async function verify(def: ProviderDef, value: string) {
    const k = value.trim();
    if (!k) return;
    setStep({ kind: "busy", def, text: "verifying key…" });
    const p = { ...resolveProvider(cfg, def.id)!, apiKey: k };
    try {
      const models = await listModels(p, AbortSignal.timeout(10000));
      cfg.keys[def.id] = k;
      saveConfig(cfg);
      setKey("");
      onDone(`${def.name} connected · ${models.filter((m) => m.free).length || models.length} models available`, def.id);
    } catch (err) {
      setKey("");
      setStep({ kind: "error", def, text: (err as Error).message });
    }
  }

  if (step.kind === "pick") {
    return (
      <Select
        title="✦ Connect an AI"
        items={providerItems(cfg)}
        height={14}
        onCancel={() => onDone(null)}
        onSelect={(it) => setStep(it.value.keyRequired ? { kind: "key", def: it.value } : { kind: "local", def: it.value })}
      />
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C.neon} paddingX={1}>
      <Text color={C.neon} bold>
        ✦ {step.def.name}
      </Text>
      {step.kind === "key" && (
        <>
          <Text color={C.dim}>1. Browser opened → sign in → create a free API key</Text>
          {step.def.signupUrl && <Text color={C.blue}>   {step.def.signupUrl}</Text>}
          <Text color={C.dim}>2. Paste it here (hidden) and press Enter</Text>
          <Box marginTop={1}>
            <Text color={C.neon}>key ❯ </Text>
            <TextInput value={key} onChange={setKey} onSubmit={(v) => verify(step.def, v)} mask="•" placeholder="sk-…" />
          </Box>
        </>
      )}
      {step.kind === "busy" && (
        <Text color={C.glow}>
          <Spinner type="dots" /> {step.text}
        </Text>
      )}
      {step.kind === "error" && (
        <>
          <Text color={C.err}>✗ {step.text}</Text>
          <Text color={C.dim}>⏎ try again · esc cancel</Text>
        </>
      )}
      {step.kind === "key" && <Text color={C.faint}>esc cancel · stored only in ~/.the-atlas/config.json</Text>}
    </Box>
  );
}

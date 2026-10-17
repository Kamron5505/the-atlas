import { listModels, readyProviders, type AtlasConfig, type ModelInfo } from "@the-atlas/core";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { Select, type SelectItem } from "./Select.js";
import { C } from "./theme.js";

export interface ModelChoice {
  provider: string;
  model?: string;
}

const cache = new Map<string, ModelInfo[]>();

/** Live models from every connected AI, free first; top item = auto chain. */
export function ModelPicker({ cfg, onDone }: { cfg: AtlasConfig; onDone: (c: ModelChoice | null) => void }) {
  const [items, setItems] = useState<SelectItem<ModelChoice>[] | null>(null);

  useEffect(() => {
    let alive = true;
    const ready = readyProviders(cfg);
    Promise.all(
      ready.map(async (p) => {
        const cached = cache.get(p.def.id);
        if (cached) return { p, models: cached };
        try {
          const models = await listModels(p, AbortSignal.timeout(6000));
          cache.set(p.def.id, models);
          return { p, models };
        } catch {
          return { p, models: [] as ModelInfo[], down: true };
        }
      }),
    ).then((groups) => {
      if (!alive) return;
      const list: SelectItem<ModelChoice>[] = [
        { key: "auto", label: "auto", value: { provider: "auto" }, badge: "⚡", hint: "best free model, switches by itself when a limit ends", group: "Atlas" },
      ];
      for (const g of groups) {
        const models = [...g.models].sort((a, b) => Number(!!b.free) - Number(!!a.free));
        if (!models.length) {
          list.push({ key: `${g.p.def.id}:down`, label: g.p.def.name, value: { provider: g.p.def.id }, hint: "not reachable", group: g.p.def.name, disabled: true });
          continue;
        }
        for (const m of models.slice(0, 60)) {
          list.push({
            key: `${g.p.def.id}/${m.id}`,
            label: m.id,
            value: { provider: g.p.def.id, model: m.id },
            badge: m.free ? "🆓" : "💳",
            hint: [m.id === g.p.model ? "default" : "", m.contextLength ? `${Math.round(m.contextLength / 1000)}k ctx` : ""].filter(Boolean).join(" · "),
            group: g.p.def.name,
          });
        }
      }
      setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [cfg]);

  if (!items) {
    return (
      <Box borderStyle="round" borderColor={C.neon} paddingX={1}>
        <Text color={C.glow}>
          <Spinner type="dots" /> loading models from your AIs…
        </Text>
      </Box>
    );
  }
  return <Select title="✦ Choose a model" items={items} height={14} onCancel={() => onDone(null)} onSelect={(it) => onDone(it.value)} />;
}

import { listModels, readyProviders, type AtlasConfig, type ModelInfo } from "@the-atlas/core";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import type { Dict } from "../i18n.js";
import { Select, type SelectItem } from "./Select.js";
import { C } from "./theme.js";

export interface ModelChoice {
  provider: string;
  model?: string;
}

const cache = new Map<string, ModelInfo[]>();

/** Live models from every connected AI, free first; top item = auto chain. */
export function ModelPicker({ cfg, L, onDone }: { cfg: AtlasConfig; L: Dict; onDone: (c: ModelChoice | null) => void }) {
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
          return { p, models: [] as ModelInfo[] };
        }
      }),
    ).then((groups) => {
      if (!alive) return;
      const list: SelectItem<ModelChoice>[] = [
        { key: "auto", label: "auto", value: { provider: "auto" }, tag: "auto", hint: L.autoHint, group: "Atlas" },
      ];
      for (const g of groups) {
        const name = g.p.def.name.replace(/ \(local\)$/, "");
        const models = [...g.models].sort((a, b) => Number(!!b.free) - Number(!!a.free) || a.id.localeCompare(b.id));
        if (!models.length) {
          list.push({ key: `${g.p.def.id}:down`, label: name, value: { provider: g.p.def.id }, hint: L.unreachable, group: name, disabled: true });
          continue;
        }
        for (const m of models.slice(0, 80)) {
          list.push({
            key: `${g.p.def.id}/${m.id}`,
            label: m.id,
            value: { provider: g.p.def.id, model: m.id },
            tag: m.free ? "free" : "paid",
            hint: [m.contextLength ? `${Math.round(m.contextLength / 1000)}k` : "", m.id === g.p.model ? L.default : ""].filter(Boolean).join(" · "),
            group: name,
          });
        }
      }
      setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [cfg, L]);

  if (!items) {
    return (
      <Box>
        <Text color={C.glow}>
          <Spinner type="dots" /> {L.loadingModels}
        </Text>
      </Box>
    );
  }
  return <Select L={L} title={L.modelTitle} items={items} height={14} onCancel={() => onDone(null)} onSelect={(it) => onDone(it.value)} />;
}
